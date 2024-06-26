// Copyright (C) The Arvados Authors. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0

package localdb

import (
	"database/sql"
	"time"

	"git.arvados.org/arvados.git/sdk/go/arvados"
	"git.arvados.org/arvados.git/sdk/go/arvadostest"
	check "gopkg.in/check.v1"
)

var _ = check.Suite(&activityPeriodSuite{})

type activityPeriodSuite struct{}

// The important thing is that, even when daylight savings time is
// making things difficult, the current period ends in the future.
func (*activityPeriodSuite) TestPeriod(c *check.C) {
	toronto, err := time.LoadLocation("America/Toronto")
	c.Assert(err, check.IsNil)

	format := "2006-01-02 15:04:05 MST"
	dststartday, err := time.ParseInLocation(format, "2022-03-13 00:00:00 EST", toronto)
	c.Assert(err, check.IsNil)
	dstendday, err := time.ParseInLocation(format, "2022-11-06 00:00:00 EDT", toronto)
	c.Assert(err, check.IsNil)

	for _, period := range []time.Duration{
		time.Minute * 13,
		time.Minute * 49,
		time.Hour,
		4 * time.Hour,
		48 * time.Hour,
	} {
		for offset := time.Duration(0); offset < 48*time.Hour; offset += 3 * time.Minute {
			t := dststartday.Add(offset)
			end := alignedPeriod(t, period)
			c.Check(end.After(t), check.Equals, true, check.Commentf("period %v offset %v", period, offset))

			t = dstendday.Add(offset)
			end = alignedPeriod(t, period)
			c.Check(end.After(t), check.Equals, true, check.Commentf("period %v offset %v", period, offset))
		}
	}
}

func (s *CollectionSuite) TestLogActivity(c *check.C) {
	starttime := time.Now()
	s.localdb.activeUsersLock.Lock()
	s.localdb.activeUsersReset = starttime
	s.localdb.activeUsersLock.Unlock()
	for i := 0; i < 2; i++ {
		logthreshold := time.Now()
		_, err := s.localdb.CollectionCreate(s.userctx, arvados.CreateOptions{
			Attrs: map[string]interface{}{
				"name": "test collection",
			},
			EnsureUniqueName: true,
		})
		c.Assert(err, check.IsNil)
		var uuid string
		err = s.db.QueryRowContext(s.ctx, `select uuid from logs where object_uuid = $1 and event_at > $2`, arvadostest.ActiveUserUUID, logthreshold.UTC()).Scan(&uuid)
		if i == 0 {
			c.Check(err, check.IsNil)
			c.Check(uuid, check.HasLen, 27)
		} else {
			c.Check(err, check.Equals, sql.ErrNoRows)
		}
	}
}
