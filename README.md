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

Seeks the file descriptor to the specified offset. TBD: not in `fs`.

## try { n = await fdio.flush(); }

A no-op, since file descriptor writes are unbuffered.

## try { n = await fdio.close(); }

Closes the underlying file descriptor.

Abstract I/O
============

Anything that implements the `read`, `write`, `seek`, `flush`, and `close` methods above.

Memory I/O
==========

## w = new unixio.MioWrite();

## n = w.length();

## buf = w.buffer();

## s = w.toString();

## r = new unixio.MioRead(buf);

## r = new unixio.MioRead(s);

Character I/O
=============

## cio = new unixio.Cio(stream);

Creates an I/O buffer for reads and writes to the specified stream (file descriptor, abstract, or memory).
Adds convenience functions for reading and writing text to and from the specified stream.

## try { cio = unixio.fopen(name, mode); }

Opens a file for buffered character I/O in the manner of `fopen`.

## try { n = await cio.read(buffer, off, len); }

## try { n = await cio.write(buffer, off, len); }

## try { n = await cio.seek(off, whence); }

## try { n = await cio.flush(); }

## try { n = await cio.close(); }

## try { n = await cio.ungetb(b); }

Puts a byte back into the buffer for the next `read`.

## try { b = await cio.getb(); }

Reads one byte from the stream, or returns unixio.EOF;

## try { b = await cio.putb(b); }

Writes one byte to the stream.

## try { n = await cio.ungetc(c); }

Puts a UTF-16 character back into the buffer for the next `read`.

## try { c = await cio.getc(); }

Reads one UTF-16 character from the stream, or returns unixio.EOF;

## try { c = await cio.putc(c); }

Writes one UTF-16 character to the stream.

## try { s = await cio.gets(); }

Reads one `\n`-terminated line from the stream and returns it as a string, or `null` for EOF.
For symmetry with `puts`, the `\n` is returned as part of the string.

## try { n = await cio.puts(s); }

Writes the specified string to the stream.

## try { s = await cio.getj(); }

Reads one JSON token from the stream and returns it as a string, or `null` for EOF.
Note that strings are returned with their quotation marks in place.

## try { b = await cio.printf(format, …); }

Writes formatted text in the manner of `printf`.

## try { s = await unixio.sprintf(format, …); }

Formats text to a string, using memory I/O.

Constants
=========

 * unixio.EOF = -1
 * unixio.SEEK_SET
 * unixio.SEEK_CUR
 * unixio.SEEK_END
 * unixio.stdin = new unixio.Cio(new unixio.Fdio(0));
 * unixio.stdout = new unixio.Cio(new unixio.Fdio(1));
 * unixio.stderr = new unixio.Cio(new unixio.Fdio(2));
