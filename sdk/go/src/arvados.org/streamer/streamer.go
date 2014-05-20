/* Implements a buffer that supports concurrent incremental read and append.
New readers start reading from the beginning of the buffer, block when reaching
the end of the buffer, and are unblocked as new data is added.

Usage:

Begin reading into a buffer with maximum size 'buffersize' from 'source':
  tr := StartTransferFromReader(buffersize, source)

To create a new reader (this can be called multiple times):
  r := tr.MakeStreamReader()

When you're done with the buffer:
  tr.Close()


Alternately, if you already have a filled buffer and just want to read out from it:
  tr := StartTransferFromSlice(buf)
  r := tr.MakeStreamReader()
  tr.Close()

*/

package streamer

import (
	"io"
)

type AsyncStream struct {
	requests      chan readRequest
	Reader_status chan error
}

// Reads from the buffer managed by the Transfer()
type StreamReader struct {
	offset    int
	requests  chan<- readRequest
	responses chan readResult
}

func AsyncStreamFromReader(buffersize int, source io.Reader) *AsyncStream {
	buf := make([]byte, buffersize)

	t := &AsyncStream{make(chan readRequest), make(chan error)}

	go transfer(buf, source, t.requests, t.Reader_status)

	return t
}

func AsyncStreamFromSlice(buf []byte) *AsyncStream {
	t := &AsyncStream{make(chan readRequest), nil}

	go transfer(buf, nil, t.requests, nil)

	return t
}

func (this *AsyncStream) MakeStreamReader() *StreamReader {
	return &StreamReader{0, this.requests, make(chan readResult)}
}

// Reads from the buffer managed by the Transfer()
func (this *StreamReader) Read(p []byte) (n int, err error) {
	this.requests <- readRequest{this.offset, len(p), this.responses}
	rr, valid := <-this.responses
	if valid {
		this.offset += len(rr.slice)
		return copy(p, rr.slice), rr.err
	} else {
		return 0, io.ErrUnexpectedEOF
	}
}

func (this *StreamReader) WriteTo(dest io.Writer) (written int64, err error) {
	// Record starting offset in order to correctly report the number of bytes sent
	starting_offset := this.offset
	for {
		this.requests <- readRequest{this.offset, 32 * 1024, this.responses}
		rr, valid := <-this.responses
		if valid {
			this.offset += len(rr.slice)
			if rr.err != nil {
				if rr.err == io.EOF {
					// EOF is not an error.
					return int64(this.offset - starting_offset), nil
				} else {
					return int64(this.offset - starting_offset), rr.err
				}
			} else {
				dest.Write(rr.slice)
			}
		} else {
			return int64(this.offset), io.ErrUnexpectedEOF
		}
	}
}

// Close the responses channel
func (this *StreamReader) Close() error {
	close(this.responses)
	return nil
}

func (this *AsyncStream) Close() {
	close(this.requests)
	if this.Reader_status != nil {
		close(this.Reader_status)
	}
}
