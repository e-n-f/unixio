unixio
======

Asynchronous buffered I/O for Node in the Unix style.

Buffered I/O
============

## try { fp = await unixio.fopen(name, mode); }

Opens a file for buffered character I/O in the manner of `fopen`. Note that the flags are parsed by
`fs.open`, so they follow those conventions, not exactly those of `stdio`.

Note that there is a global reference to all Files that have not been closed, so that they can be flushed
if necessary as the process is exiting.

## fp = new unixio.File(stream);

Creates an I/O buffer for reads and writes to the specified stream (file descriptor, memory, pipe,
or abstract, as described below).

## unixio.stdin, unixio.stdout, unixio.stderr

Pre-opened streams for standard input, output, and error.

## try { n = await fp.read(buffer, off, len); }

Reads up to *len* bytes into the specified Buffer, beginning at offset *off*.

## try { n = await fp.write(buffer, off, len); }

Writes up to *len* bytes from the specified Buffer, beginning at offset *off*.

## try { n = await fp.seek(off, whence); }

Flushes out any pending writes and seeks the file descriptor to the specified offset.

## try { n = await fp.flush(); }

Flushes out any pending writes.

## try { n = await fp.close(); }

Flushes out any pending writes; deregisters the buffer from the global stream list;
closes the underlying stream.

## try { b = await fp.getb(); }

Reads one byte from the stream, or returns unixio.EOF;

## try { b = await fp.putb(b); }

Writes one byte to the stream.

## try { n = await fp.ungetb(b); }

Puts a byte back into the buffer for the next `read`.

## try { c = await fp.getc(); }

Reads one UTF-16 character from the stream, or returns unixio.EOF;

## try { c = await fp.putc(c); }

Writes one UTF-16 character to the stream.

## try { n = await fp.ungetc(c); }

Puts a UTF-16 character back into the buffer for the next `read`.

## try { s = await fp.gets(); }

Reads one `\n`-terminated line from the stream and returns it as a string, or `null` for EOF.
For symmetry with `puts`, the `\n` is returned as part of the string.

## try { n = await fp.puts(s); }

Writes the specified string to the stream.

## try { s = await fp.getj(); }

Reads one JSON token from the stream and returns it as a string, or `null` for EOF.
Note that strings are returned with their quotation marks in place.

Abstract I/O
============

Anything that implements the `read`, `write`, `seek`, `flush`, and `close` methods.

File descriptor I/O (unbuffered)
================================

## fdio = new unixio.Fdio(fd);

Creates a new file descriptor object referring to an already-open file descriptor.

## try { fdio = await unixio.open(fname, mode [, perm]); }

Opens the named file in the manner of `fs.open` and creates a file descriptor referring to it.

## try { n = await fdio.read(buffer, off, len); }

Reads up to *len* bytes into the specified Buffer, beginning at offset *off*.

## try { n = await fdio.write(buffer, off, len); }

Writes up to *len* bytes from the specified Buffer, beginning at offset *off*.

## try { n = await fdio.seek(off, whence); }

Seeks the file descriptor to the specified offset.

## try { n = await fdio.flush(); }

A no-op, since file descriptor writes are unbuffered.

## try { n = await fdio.close(); }

Closes the underlying file descriptor.

Memory I/O
==========

## w = new unixio.Memio();

Opens a stream to append to the end of a new buffer.

## buf = w.buffer();

## n = w.length();

## s = w.toString();

## r = new unixio.Memio(buf);

Opens a stream to read from the start of an existing Buffer.

In-process pipe
===============

## p = new unixio.Mempipe();

## try { n = await p.to.write(buf, off, len); }

Puts data into the pipe. It is buffered until a reader is ready to consume it.

## try { n = await p.to.close(); }

Closes the pipe for writing. Readers can consume the remaining data from the pipe,
and then will receive EOF after no more is available.

## try { n = await p.from.read(buf, off, len); }

Reads data from the pipe. If no data is available, the `await` does not resolve
until data is available or the pipe has been closed.

## try { n = await p.from.close(); }

Closes the pipe for reading. Any additional writes to the pipe will result in
a broken pipe error.

Command line arguments
======================

## try { optind = await unixio.getopt(noargs, withargs); }

Parses command line arguments. `noargs` and `withargs` are maps from option names
(like "-e" or "--verbose") to functions.

Options in `noargs` do not take arguments,
and multiple short options may be combined in a single command line argument.

Options in `withargs`
take an argument, which is either the text following a short argument, the next argument,
or text following an `=` sign in a long argument. That is, the following will all work:

 * `-etext`
 * `-e text`
 * `--expression=text`
 * `--expression text`

An argument of `-` or `--` ends argument processing, with `-` being left available
as a filename argument, and `--` being eliminated.

The return value from `getopt` is the index of the first element of `process.argv`
that is a filename argument, not an option.

If an option specified in `process.argv` has no specified handler, or if there is no
argument text for an option in `withargs`, it throws an Error.

Utility
=======

## try { await unixio.usleep(n) }

Sleeps for *n* microseconds by scheduling a Promise to resolve at that time.
(Note that the sleep time is only accurate to one millisecond at best, since
that is the unit that the underlying `setTimeout` uses.

Constants
=========

 * unixio.EOF = -1
 * unixio.SEEK_SET = 0
 * unixio.SEEK_CUR = 1
 * unixio.SEEK_END = 2
 * unixio.stdin = new unixio.File(new unixio.Fdio(0));
 * unixio.stdout = new unixio.File(new unixio.Fdio(1));
 * unixio.stderr = new unixio.File(new unixio.Fdio(2));
