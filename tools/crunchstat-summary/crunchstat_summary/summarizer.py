# Copyright (C) The Arvados Authors. All rights reserved.
#
# SPDX-License-Identifier: AGPL-3.0

import arvados
import collections
import crunchstat_summary.dygraphs
import crunchstat_summary.reader
import datetime
import functools
import itertools
import math
import re
import sys
import _strptime
import arvados.util

from concurrent.futures import ThreadPoolExecutor

from crunchstat_summary import logger

# Recommend memory constraints that are this multiple of an integral
# number of GiB. (Actual nodes tend to be sold in sizes like 8 GiB
# that have amounts like 7.5 GiB according to the kernel.)
AVAILABLE_RAM_RATIO = 0.90
MB=2**20

# Workaround datetime.datetime.strptime() thread-safety bug by calling
# it once before starting threads.  https://bugs.python.org/issue7980
datetime.datetime.strptime('1999-12-31_23:59:59', '%Y-%m-%d_%H:%M:%S')


WEBCHART_CLASS = crunchstat_summary.dygraphs.DygraphsChart


class Task(object):
    def __init__(self):
        self.starttime = None
        self.finishtime = None
        self.series = collections.defaultdict(list)


class Summarizer(object):
    def __init__(self, logdata, label=None, skip_child_jobs=False, uuid=None, **kwargs):
        self._logdata = logdata

        self.uuid = uuid
        self.label = label
        self.starttime = None
        self.finishtime = None
        self._skip_child_jobs = skip_child_jobs

        # stats_max: {category: {stat: val}}
        self.stats_max = collections.defaultdict(
            functools.partial(collections.defaultdict, lambda: 0))
        # task_stats: {task_id: {category: {stat: val}}}
        self.task_stats = collections.defaultdict(
            functools.partial(collections.defaultdict, dict))

        self.seq_to_uuid = {}
        self.tasks = collections.defaultdict(Task)

        # We won't bother recommending new runtime constraints if the
        # constraints given when running the job are known to us and
        # are already suitable.  If applicable, the subclass
        # constructor will overwrite this with something useful.
        self.existing_constraints = {}
        self.node_info = {}

        logger.info("%s: logdata %s", self.label, logdata)

    def run(self):
        logger.debug("%s: parsing logdata %s", self.label, self._logdata)
        with self._logdata as logdata:
            self._run(logdata)

    def _run(self, logdata):
        self.detected_crunch1 = False

        if not self.node_info:
            self.node_info = logdata.node_info()

        for line in logdata:
            if not self.detected_crunch1 and '-8i9sb-' in line:
                self.detected_crunch1 = True

            if self.detected_crunch1:
                m = re.search(r'^\S+ \S+ \d+ (?P<seq>\d+) job_task (?P<task_uuid>\S+)$', line)
                if m:
                    seq = int(m.group('seq'))
                    uuid = m.group('task_uuid')
                    self.seq_to_uuid[seq] = uuid
                    logger.debug('%s: seq %d is task %s', self.label, seq, uuid)
                    continue

                m = re.search(r'^\S+ \S+ \d+ (?P<seq>\d+) (success in|failure \(#., permanent\) after) (?P<elapsed>\d+) seconds', line)
                if m:
                    task_id = self.seq_to_uuid[int(m.group('seq'))]
                    elapsed = int(m.group('elapsed'))
                    self.task_stats[task_id]['time'] = {'elapsed': elapsed}
                    if elapsed > self.stats_max['time']['elapsed']:
                        self.stats_max['time']['elapsed'] = elapsed
                    continue

                m = re.search(r'^\S+ \S+ \d+ (?P<seq>\d+) stderr Queued job (?P<uuid>\S+)$', line)
                if m:
                    uuid = m.group('uuid')
                    if self._skip_child_jobs:
                        logger.warning('%s: omitting stats from child job %s'
                                       ' because --skip-child-jobs flag is on',
                                       self.label, uuid)
                        continue
                    logger.debug('%s: follow %s', self.label, uuid)
                    child_summarizer = NewSummarizer(uuid)
                    child_summarizer.stats_max = self.stats_max
                    child_summarizer.task_stats = self.task_stats
                    child_summarizer.tasks = self.tasks
                    child_summarizer.starttime = self.starttime
                    child_summarizer.run()
                    logger.debug('%s: done %s', self.label, uuid)
                    continue

                # 2017-12-02_17:15:08 e51c5-8i9sb-mfp68stkxnqdd6m 63676 0 stderr crunchstat: keepcalls 0 put 2576 get -- interval 10.0000 seconds 0 put 2576 get
                m = re.search(r'^(?P<timestamp>[^\s.]+)(\.\d+)? (?P<job_uuid>\S+) \d+ (?P<seq>\d+) stderr (?P<crunchstat>crunchstat: )(?P<category>\S+) (?P<current>.*?)( -- interval (?P<interval>.*))?\n$', line)
                if not m:
                    continue
            else:
                # crunch2
                # 2017-12-01T16:56:24.723509200Z crunchstat: keepcalls 0 put 3 get -- interval 10.0000 seconds 0 put 3 get
                m = re.search(r'^(?P<timestamp>\S+) (?P<crunchstat>crunchstat: )?(?P<category>\S+) (?P<current>.*?)( -- interval (?P<interval>.*))?\n$', line)
                if not m:
                    continue

            if self.label is None:
                try:
                    self.label = m.group('job_uuid')
                except IndexError:
                    self.label = 'label #1'
            category = m.group('category')
            if category.endswith(':'):
                # "stderr crunchstat: notice: ..."
                continue
            elif category in ('error', 'caught'):
                continue
            elif category in ('read', 'open', 'cgroup', 'CID', 'Running'):
                # "stderr crunchstat: read /proc/1234/net/dev: ..."
                # (old logs are less careful with unprefixed error messages)
                continue

            if self.detected_crunch1:
                task_id = self.seq_to_uuid[int(m.group('seq'))]
            else:
                task_id = 'container'
            task = self.tasks[task_id]

            # Use the first and last crunchstat timestamps as
            # approximations of starttime and finishtime.
            timestamp = m.group('timestamp')
            if timestamp[10:11] == '_':
                timestamp = datetime.datetime.strptime(
                    timestamp, '%Y-%m-%d_%H:%M:%S')
            elif timestamp[10:11] == 'T':
                timestamp = datetime.datetime.strptime(
                    timestamp[:19], '%Y-%m-%dT%H:%M:%S')
            else:
                raise ValueError("Cannot parse timestamp {!r}".format(
                    timestamp))

            if task.starttime is None:
                logger.debug('%s: task %s starttime %s',
                             self.label, task_id, timestamp)
            if task.starttime is None or timestamp < task.starttime:
                task.starttime = timestamp
            if task.finishtime is None or timestamp > task.finishtime:
                task.finishtime = timestamp

            if self.starttime is None or timestamp < self.starttime:
                self.starttime = timestamp
            if self.finishtime is None or timestamp > self.finishtime:
                self.finishtime = timestamp

            if (not self.detected_crunch1) and task.starttime is not None and task.finishtime is not None:
                elapsed = (task.finishtime - task.starttime).seconds
                self.task_stats[task_id]['time'] = {'elapsed': elapsed}
                if elapsed > self.stats_max['time']['elapsed']:
                    self.stats_max['time']['elapsed'] = elapsed

            this_interval_s = None
            for group in ['current', 'interval']:
                if not m.group(group):
                    continue
                category = m.group('category')
                words = m.group(group).split(' ')
                stats = {}
                try:
                    for val, stat in zip(words[::2], words[1::2]):
                        if '.' in val:
                            stats[stat] = float(val)
                        else:
                            stats[stat] = int(val)
                except ValueError as e:
                    # If the line doesn't start with 'crunchstat:' we
                    # might have mistaken an error message for a
                    # structured crunchstat line.
                    if m.group("crunchstat") is None or m.group("category") == "crunchstat":
                        logger.warning("%s: log contains message\n  %s", self.label, line)
                    else:
                        logger.warning(
                            '%s: Error parsing value %r (stat %r, category %r): %r',
                            self.label, val, stat, category, e)
                        logger.warning('%s', line)
                    continue
                if 'user' in stats or 'sys' in stats:
                    stats['user+sys'] = stats.get('user', 0) + stats.get('sys', 0)
                if 'tx' in stats or 'rx' in stats:
                    stats['tx+rx'] = stats.get('tx', 0) + stats.get('rx', 0)
                if group == 'interval':
                    if 'seconds' in stats:
                        this_interval_s = stats.get('seconds',0)
                        del stats['seconds']
                        if this_interval_s <= 0:
                            logger.error(
                                "BUG? interval stat given with duration {!r}".
                                format(this_interval_s))
                    else:
                        logger.error('BUG? interval stat missing duration')
                for stat, val in stats.items():
                    if group == 'interval' and this_interval_s:
                            stat = stat + '__rate'
                            val = val / this_interval_s
                            if stat in ['user+sys__rate', 'user__rate', 'sys__rate', 'tx+rx__rate', 'rx__rate', 'tx__rate']:
                                task.series[category, stat].append(
                                    (timestamp - self.starttime, val))
                    else:
                        if stat in ['rss','used','total']:
                            task.series[category, stat].append(
                                (timestamp - self.starttime, val))
                        self.task_stats[task_id][category][stat] = val
                    if val > self.stats_max[category][stat]:
                        self.stats_max[category][stat] = val
        logger.debug('%s: done parsing', self.label)

        self.job_tot = collections.defaultdict(
            functools.partial(collections.defaultdict, int))
        for task_id, task_stat in self.task_stats.items():
            for category, stat_last in task_stat.items():
                for stat, val in stat_last.items():
                    if stat in ['cpus', 'cache', 'swap', 'rss']:
                        # meaningless stats like 16 cpu cores x 5 tasks = 80
                        continue
                    self.job_tot[category][stat] += val
        logger.debug('%s: done totals', self.label)

        missing_category = {
            'cpu': 'CPU',
            'mem': 'memory',
            'net:': 'network I/O',
            'statfs': 'storage space',
        }
        for task_stat in self.task_stats.values():
            for category in task_stat.keys():
                for checkcat in missing_category:
                    if checkcat.endswith(':'):
                        if category.startswith(checkcat):
                            missing_category.pop(checkcat)
                            break
                    else:
                        if category == checkcat:
                            missing_category.pop(checkcat)
                            break
        for catlabel in missing_category.values():
            logger.warning('%s: %s stats are missing -- possible cluster configuration issue',
                        self.label, catlabel)

    def long_label(self):
        label = self.label
        if hasattr(self, 'process') and self.process['uuid'] not in label:
            label = '{} ({})'.format(label, self.process['uuid'])
        return label

    def elapsed_time(self):
        if not self.finishtime:
            return ""
        label = ""
        s = (self.finishtime - self.starttime).total_seconds()
        if s > 86400:
            label += '{}d '.format(int(s/86400))
        if s > 3600:
            label += '{}h '.format(int(s/3600) % 24)
        if s > 60:
            label += '{}m '.format(int(s/60) % 60)
        label += '{}s'.format(int(s) % 60)
        return label

    def text_report(self):
        if not self.tasks:
            return "(no report generated)\n"
        return "\n".join(itertools.chain(
            self._text_report_table_gen(lambda x: "\t".join(x),
                                  lambda x: "\t".join(x)),
            self._text_report_agg_gen(lambda x: "# {}: {}{}".format(x[0], x[1], x[2])),
            self._recommend_gen(lambda x: "#!! "+x))) + "\n"

    def html_report(self):
        return WEBCHART_CLASS(self.label, [self]).html()

    def _text_report_table_gen(self, headerformat, rowformat):
        yield headerformat(['category', 'metric', 'task_max', 'task_max_rate', 'job_total'])
        for category, stat_max in sorted(self.stats_max.items()):
            for stat, val in sorted(stat_max.items()):
                if stat.endswith('__rate'):
                    continue
                max_rate = self._format(stat_max.get(stat+'__rate', '-'))
                val = self._format(val)
                tot = self._format(self.job_tot[category].get(stat, '-'))
                yield rowformat([category, stat, str(val), max_rate, tot])

    def _text_report_agg_gen(self, aggformat):
        by_single_task = ""
        if len(self.tasks) > 1:
            by_single_task = " by a single task"

        metrics = [
            ('Elapsed time',
             self.elapsed_time(),
             None,
             ''),

            ('Estimated cost',
             '${:.3f}'.format(self.cost),
             None,
             '') if self.cost > 0 else None,

            ('Assigned instance type',
             self.node_info.get('ProviderType'),
             None,
             '') if self.node_info.get('ProviderType') else None,

            ('Instance hourly price',
             '${:.3f}'.format(self.node_info.get('Price')),
             None,
             '') if self.node_info.get('Price') else None,

            ('Max CPU usage in a single interval',
             self.stats_max['cpu']['user+sys__rate'],
             lambda x: x * 100,
             '%'),

            ('Overall CPU usage',
             float(self.job_tot['cpu']['user+sys']) /
             self.job_tot['time']['elapsed']
             if self.job_tot['time']['elapsed'] > 0 else 0,
             lambda x: x * 100,
             '%'),

            ('Requested CPU cores',
             self.existing_constraints.get(self._map_runtime_constraint('vcpus')),
             None,
             ''),

            ('Instance VCPUs',
             self.node_info.get('VCPUs'),
             None,
             '') if self.node_info.get('VCPUs') else None,

            ('Max memory used{}'.format(by_single_task),
             self.stats_max['mem']['rss'],
             lambda x: x / 2**20,
             'MB'),

            ('Requested RAM',
             self.existing_constraints.get(self._map_runtime_constraint('ram')),
             lambda x: x / 2**20,
             'MB'),

            ('Maximum RAM request for this instance type',
             (self.node_info.get('RAM') - self.arv_config.get('Containers', {}).get('ReserveExtraRAM', {}))*.95,
             lambda x: x / 2**20,
             'MB'),

            ('Max network traffic{}'.format(by_single_task),
             self.stats_max['net:eth0']['tx+rx'] +
             self.stats_max['net:keep0']['tx+rx'],
             lambda x: x / 1e9,
             'GB'),

            ('Max network speed in a single interval',
             self.stats_max['net:eth0']['tx+rx__rate'] +
             self.stats_max['net:keep0']['tx+rx__rate'],
             lambda x: x / 1e6,
             'MB/s'),

            ('Keep cache miss rate',
             (float(self.job_tot['keepcache']['miss']) /
              float(self.job_tot['keepcalls']['get']))
             if self.job_tot['keepcalls']['get'] > 0 else 0,
             lambda x: x * 100.0,
             '%'),

            ('Keep cache utilization',
             (float(self.job_tot['blkio:0:0']['read']) /
              float(self.job_tot['net:keep0']['rx']))
             if self.job_tot['net:keep0']['rx'] > 0 else 0,
             lambda x: x * 100.0,
             '%'),

            ('Temp disk utilization',
             (float(self.job_tot['statfs']['used']) /
              float(self.job_tot['statfs']['total']))
             if self.job_tot['statfs']['total'] > 0 else 0,
             lambda x: x * 100.0,
             '%'),
        ]

        if len(self.tasks) > 1:
            metrics.insert(0, ('Number of tasks',
                 len(self.tasks),
                 None,
                 ''))
        for args in metrics:
            if args is None:
                continue
            format_string, val, transform, suffix = args
            if val == float('-Inf'):
                continue
            if transform:
                val = transform(val)
            yield aggformat((format_string, self._format(val), suffix))

    def _recommend_gen(self, recommendformat):
        # TODO recommend fixing job granularity if elapsed time is too short
        return itertools.chain(
            self._recommend_cpu(recommendformat),
            self._recommend_ram(recommendformat),
            self._recommend_keep_cache(recommendformat),
            self._recommend_temp_disk(recommendformat),
            )

    def _recommend_cpu(self, recommendformat):
        """Recommend asking for 4 cores if max CPU usage was 333%"""

        constraint_key = self._map_runtime_constraint('vcpus')
        cpu_max_rate = self.stats_max['cpu']['user+sys__rate']
        if cpu_max_rate == float('-Inf') or cpu_max_rate == 0.0:
            logger.warning('%s: no CPU usage data', self.label)
            return
        # TODO Don't necessarily want to recommend on isolated max peak
        # take average CPU usage into account as well or % time at max
        used_cores = max(1, int(math.ceil(cpu_max_rate)))
        asked_cores = self.existing_constraints.get(constraint_key)
        if asked_cores is None:
            asked_cores = 1
        # TODO: This should be more nuanced in cases where max >> avg
        if used_cores < asked_cores:
            yield recommendformat(
                '{} max CPU usage was {}% -- '
                'try reducing runtime_constraints to "{}":{}'
            ).format(
                self.label,
                math.ceil(cpu_max_rate*100),
                constraint_key,
                int(used_cores))

    # FIXME: This needs to be updated to account for current a-d-c algorithms
    def _recommend_ram(self, recommendformat):
        """Recommend an economical RAM constraint for this job.

        Nodes that are advertised as "8 gibibytes" actually have what
        we might call "8 nearlygibs" of memory available for jobs.
        Here, we calculate a whole number of nearlygibs that would
        have sufficed to run the job, then recommend requesting a node
        with that number of nearlygibs (expressed as mebibytes).

        Requesting a node with "nearly 8 gibibytes" is our best hope
        of getting a node that actually has nearly 8 gibibytes
        available.  If the node manager is smart enough to account for
        the discrepancy itself when choosing/creating a node, we'll
        get an 8 GiB node with nearly 8 GiB available.  Otherwise, the
        advertised size of the next-size-smaller node (say, 6 GiB)
        will be too low to satisfy our request, so we will effectively
        get rounded up to 8 GiB.

        For example, if we need 7500 MiB, we can ask for 7500 MiB, and
        we will generally get a node that is advertised as "8 GiB" and
        has at least 7500 MiB available.  However, asking for 8192 MiB
        would either result in an unnecessarily expensive 12 GiB node
        (if node manager knows about the discrepancy), or an 8 GiB
        node which has less than 8192 MiB available and is therefore
        considered by crunch-dispatch to be too small to meet our
        constraint.

        When node manager learns how to predict the available memory
        for each node type such that crunch-dispatch always agrees
        that a node is big enough to run the job it was brought up
        for, all this will be unnecessary.  We'll just ask for exactly
        the memory we want -- even if that happens to be 8192 MiB.
        """

        constraint_key = self._map_runtime_constraint('ram')
        used_bytes = self.stats_max['mem']['rss']
        if used_bytes == float('-Inf'):
            logger.warning('%s: no memory usage data', self.label)
            return
        used_mib = math.ceil(float(used_bytes) / MB)
        asked_mib = self.existing_constraints.get(constraint_key) / MB

        nearlygibs = lambda mebibytes: mebibytes/AVAILABLE_RAM_RATIO/1024
        ratio = 0.5
        recommend_mib = int(math.ceil(nearlygibs(used_mib/ratio))*AVAILABLE_RAM_RATIO*1024)
        if used_mib > 0 and (used_mib / asked_mib) < ratio and asked_mib > recommend_mib:
            yield recommendformat(
                '{} requested {} MiB of RAM but actual RAM usage was below {}% at {} MiB -- '
                'suggest reducing RAM request to {} MiB'
            ).format(
                self.label,
                int(asked_mib),
                int(100*ratio),
                int(used_mib),
                recommend_mib)

    def _recommend_keep_cache(self, recommendformat):
        """Recommend increasing keep cache if utilization < 80%"""
        constraint_key = self._map_runtime_constraint('keep_cache_ram')
        if self.job_tot['net:keep0']['rx'] == 0:
            return
        utilization = (float(self.job_tot['blkio:0:0']['read']) /
                       float(self.job_tot['net:keep0']['rx']))
        # FIXME: the default on this get won't work correctly
        asked_cache = self.existing_constraints.get(constraint_key, 256) * self._runtime_constraint_mem_unit()

        if utilization < 0.8:
            yield recommendformat(
                '{} Keep cache utilization was {:.2f}% -- '
                'try doubling runtime_constraints to "{}":{} (or more)'
            ).format(
                self.label,
                utilization * 100.0,
                constraint_key,
                math.ceil(asked_cache * 2 / self._runtime_constraint_mem_unit()))


    def _recommend_temp_disk(self, recommendformat):
        """Recommend decreasing temp disk if utilization < 50%"""
        total = float(self.job_tot['statfs']['total'])
        utilization = (float(self.job_tot['statfs']['used']) / total) if total > 0 else 0.0

        if utilization < 50.8 and total > 0:
            yield recommendformat(
                '{} max temp disk utilization was {:.0f}% of {:.0f} MiB -- '
                'consider reducing "tmpdirMin" and/or "outdirMin"'
            ).format(
                self.label,
                utilization * 100.0,
                total / MB)


    def _format(self, val):
        """Return a string representation of a stat.

        {:.2f} for floats, default format for everything else."""
        if isinstance(val, float):
            return '{:.2f}'.format(val)
        else:
            return '{}'.format(val)

    def _runtime_constraint_mem_unit(self):
        if hasattr(self, 'runtime_constraint_mem_unit'):
            return self.runtime_constraint_mem_unit
        elif self.detected_crunch1:
            return JobSummarizer.runtime_constraint_mem_unit
        else:
            return ContainerRequestSummarizer.runtime_constraint_mem_unit

    def _map_runtime_constraint(self, key):
        if hasattr(self, 'map_runtime_constraint'):
            return self.map_runtime_constraint[key]
        elif self.detected_crunch1:
            return JobSummarizer.map_runtime_constraint[key]
        else:
            return key


class CollectionSummarizer(Summarizer):
    def __init__(self, collection_id, **kwargs):
        super(CollectionSummarizer, self).__init__(
            crunchstat_summary.reader.CollectionReader(collection_id), **kwargs)
        self.label = collection_id


def NewSummarizer(process_or_uuid, **kwargs):
    """Construct with the appropriate subclass for this uuid/object."""

    if isinstance(process_or_uuid, dict):
        process = process_or_uuid
        uuid = process['uuid']
    else:
        uuid = process_or_uuid
        process = None
        arv = kwargs.get("arv") or arvados.api('v1')

    if '-dz642-' in uuid:
        if process is None:
            # Get the associated CR. Doesn't matter which since they all have the same logs
            crs = arv.container_requests().list(filters=[['container_uuid','=',uuid]],limit=1).execute()['items']
            if len(crs) > 0:
                process = crs[0]
        klass = ContainerRequestTreeSummarizer
    elif '-xvhdp-' in uuid:
        if process is None:
            process = arv.container_requests().get(uuid=uuid).execute()
        klass = ContainerRequestTreeSummarizer
    elif '-8i9sb-' in uuid:
        if process is None:
            process = arv.jobs().get(uuid=uuid).execute()
        klass = JobTreeSummarizer
    elif '-d1hrv-' in uuid:
        if process is None:
            process = arv.pipeline_instances().get(uuid=uuid).execute()
        klass = PipelineSummarizer
    elif '-4zz18-' in uuid:
        return CollectionSummarizer(collection_id=uuid)
    else:
        raise ArgumentError("Unrecognized uuid %s", uuid)
    return klass(process, uuid=uuid, **kwargs)


class ProcessSummarizer(Summarizer):
    """Process is a job, pipeline, or container request."""

    def __init__(self, process, label=None, **kwargs):
        rdr = None
        self.process = process
        arv = kwargs.get("arv") or arvados.api('v1')
        if label is None:
            label = self.process.get('name', self.process['uuid'])
        # Pre-Arvados v1.4 everything is in 'log'
        # For 1.4+ containers have no logs and container_requests have them in 'log_uuid', not 'log'
        log_collection = self.process.get('log', self.process.get('log_uuid'))
        if log_collection and self.process.get('state') != 'Uncommitted': # arvados.util.CR_UNCOMMITTED:
            try:
                rdr = crunchstat_summary.reader.CollectionReader(log_collection, api_client=arv)
            except arvados.errors.NotFoundError as e:
                logger.warning("Trying event logs after failing to read "
                               "log collection %s: %s", self.process['log'], e)
        if rdr is None:
            uuid = self.process.get('container_uuid', self.process.get('uuid'))
            rdr = crunchstat_summary.reader.LiveLogReader(uuid)
            label = label + ' (partial)'

        super(ProcessSummarizer, self).__init__(rdr, label=label, **kwargs)
        self.existing_constraints = self.process.get('runtime_constraints', {})
        self.arv_config = arv.config()
        self.cost = self.process.get('cost', 0)



class JobSummarizer(ProcessSummarizer):
    runtime_constraint_mem_unit = MB
    map_runtime_constraint = {
        'keep_cache_ram': 'keep_cache_mb_per_task',
        'ram': 'min_ram_mb_per_node',
        'vcpus': 'min_cores_per_node',
    }


class ContainerRequestSummarizer(ProcessSummarizer):
    runtime_constraint_mem_unit = 1


class MultiSummarizer(object):
    def __init__(self, children={}, label=None, threads=1, **kwargs):
        self.children = children
        self.label = label
        self.threadcount = threads

    def run(self):
        if self.threadcount > 1 and len(self.children) > 1:
            completed = 0
            def run_and_progress(child):
                try:
                    child.run()
                except Exception as e:
                    logger.exception("parse error")
                completed += 1
                logger.info("%s/%s summarized %s", completed, len(self.children), child.label)
            with ThreadPoolExecutor(max_workers=self.threadcount) as tpe:
                for child in self.children.values():
                    tpe.submit(run_and_progress, child)
        else:
            for child in self.children.values():
                child.run()

    def text_report(self):
        txt = ''
        d = self._descendants()
        for child in d.values():
            if len(d) > 1:
                txt += '### Summary for {} ({})\n'.format(
                    child.label, child.process['uuid'])
            txt += child.text_report()
            txt += '\n'
        return txt

    def _descendants(self):
        """Dict of self and all descendants.

        Nodes with nothing of their own to report (like
        MultiSummarizers) are omitted.
        """
        d = collections.OrderedDict()
        for key, child in self.children.items():
            if isinstance(child, Summarizer):
                d[key] = child
            if isinstance(child, MultiSummarizer):
                d.update(child._descendants())
        return d

    def html_report(self):
        tophtml = ""
        bottomhtml = ""
        label = self.label
        if len(self._descendants()) == 1:
            summarizer = next(iter(self._descendants().values()))
            tophtml = """{}\n<table class='aggtable'><tbody>{}</tbody></table>\n""".format(
                "\n".join(summarizer._recommend_gen(lambda x: "<p>{}</p>".format(x))),
                "\n".join(summarizer._text_report_agg_gen(lambda x: "<tr><th>{}</th><td>{}{}</td></tr>".format(*x))))

            bottomhtml = """<table class='metricstable'><tbody>{}</tbody></table>\n""".format(
                "\n".join(summarizer._text_report_table_gen(lambda x: "<tr><th>{}</th><th>{}</th><th>{}</th><th>{}</th><th>{}</th></tr>".format(*x),
                                                            lambda x: "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(*x))))
            label = summarizer.long_label()

        return WEBCHART_CLASS(label, iter(self._descendants().values())).html(tophtml, bottomhtml)


class JobTreeSummarizer(MultiSummarizer):
    """Summarizes a job and all children listed in its components field."""
    def __init__(self, job, label=None, **kwargs):
        arv = kwargs.get("arv") or arvados.api('v1')
        label = label or job.get('name', job['uuid'])
        children = collections.OrderedDict()
        children[job['uuid']] = JobSummarizer(job, label=label, **kwargs)
        if job.get('components', None):
            preloaded = {}
            for j in arv.jobs().index(
                    limit=len(job['components']),
                    filters=[['uuid','in',list(job['components'].values())]]).execute()['items']:
                preloaded[j['uuid']] = j
            for cname in sorted(job['components'].keys()):
                child_uuid = job['components'][cname]
                j = (preloaded.get(child_uuid) or
                     arv.jobs().get(uuid=child_uuid).execute())
                children[child_uuid] = JobTreeSummarizer(job=j, label=cname, **kwargs)

        super(JobTreeSummarizer, self).__init__(
            children=children,
            label=label,
            **kwargs)


class PipelineSummarizer(MultiSummarizer):
    def __init__(self, instance, **kwargs):
        children = collections.OrderedDict()
        for cname, component in instance['components'].items():
            if 'job' not in component:
                logger.warning(
                    "%s: skipping component with no job assigned", cname)
            else:
                logger.info(
                    "%s: job %s", cname, component['job']['uuid'])
                summarizer = JobTreeSummarizer(component['job'], label=cname, **kwargs)
                summarizer.label = '{} {}'.format(
                    cname, component['job']['uuid'])
                children[cname] = summarizer
        super(PipelineSummarizer, self).__init__(
            children=children,
            label=instance['uuid'],
            **kwargs)


class ContainerRequestTreeSummarizer(MultiSummarizer):
    def __init__(self, root, skip_child_jobs=False, **kwargs):
        arv = kwargs.get("arv") or arvados.api('v1')

        label = kwargs.pop('label', None) or root.get('name') or root['uuid']
        root['name'] = label

        children = collections.OrderedDict()
        todo = collections.deque((root, ))
        while len(todo) > 0:
            current = todo.popleft()
            label = current['name']
            sort_key = current['created_at']

            summer = ContainerRequestSummarizer(current, label=label, **kwargs)
            summer.sort_key = sort_key
            children[current['uuid']] = summer

            if skip_child_jobs:
                child_crs = arv.container_requests().list(filters=[['requesting_container_uuid', '=', current['container_uuid']]],
                                                          limit=0).execute()
                logger.warning('%s: omitting stats from child containers'
                               ' because --skip-child-jobs flag is on',
                               label, child_crs['items_available'])
            else:
                for cr in arvados.util.keyset_list_all(arv.container_requests().list,
                                                       filters=[['requesting_container_uuid', '=', current['container_uuid']]]):
                    if cr['container_uuid']:
                        logger.debug('%s: container req %s', current['uuid'], cr['uuid'])
                        cr['name'] = cr.get('name') or cr['uuid']
                        todo.append(cr)
        sorted_children = collections.OrderedDict()
        for uuid in sorted(list(children.keys()), key=lambda uuid: children[uuid].sort_key):
            sorted_children[uuid] = children[uuid]
        super(ContainerRequestTreeSummarizer, self).__init__(
            children=sorted_children,
            label=root['name'],
            **kwargs)
