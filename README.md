unixio
======

Asynchronous buffered I/O for Node in the Unix style.

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

Abstract I/O
============

Anything that implements the `read`, `write`, `seek`, `flush`, and `close` methods above.

Memory I/O
==========

## w = new unixio.Memio();

Opens a stream to append to the end of a new buffer.

## buf = w.buffer();

## n = w.length();

## s = w.toString();

## r = new unixio.Memio(buf);

Opens a stream to read from the start of an existing Buffer.

Buffered I/O
============

## fp = new unixio.File(stream);

Creates an I/O buffer for reads and writes to the specified stream (file descriptor, abstract, or memory).
Adds convenience functions for reading and writing text to and from the specified stream.

Note that there is a global reference to all Files that have not been closed, so that they can be flushed
if necessary as the process is exiting.

## try { fp = await unixio.fopen(name, mode); }

Opens a file for buffered character I/O in the manner of `fopen`. Note that the flags are parsed by
`fs.open`, so they follow those conventions, not exactly those of `stdio`.

## try { n = await fp.read(buffer, off, len); }

## try { n = await fp.write(buffer, off, len); }

## try { n = await fp.seek(off, whence); }

## try { n = await fp.flush(); }

## try { n = await fp.close(); }

## try { n = await fp.ungetb(b); }

Puts a byte back into the buffer for the next `read`.

## try { b = await fp.getb(); }

Reads one byte from the stream, or returns unixio.EOF;

## try { b = await fp.putb(b); }

Writes one byte to the stream.

## try { n = await fp.ungetc(c); }

Puts a UTF-16 character back into the buffer for the next `read`.

## try { c = await fp.getc(); }

Reads one UTF-16 character from the stream, or returns unixio.EOF;

## try { c = await fp.putc(c); }

Writes one UTF-16 character to the stream.

## try { s = await fp.gets(); }

Reads one `\n`-terminated line from the stream and returns it as a string, or `null` for EOF.
For symmetry with `puts`, the `\n` is returned as part of the string.

## try { n = await fp.puts(s); }

Writes the specified string to the stream.

## try { s = await fp.getj(); }

Reads one JSON token from the stream and returns it as a string, or `null` for EOF.
Note that strings are returned with their quotation marks in place.

Constants
=========

 * unixio.EOF = -1
 * unixio.SEEK_SET = 0
 * unixio.SEEK_CUR = 1
 * unixio.SEEK_END = 2
 * unixio.stdin = new unixio.File(new unixio.Fdio(0));
 * unixio.stdout = new unixio.File(new unixio.Fdio(1));
 * unixio.stderr = new unixio.File(new unixio.Fdio(2));
