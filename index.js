'use strict';

const fsext = require('fs-ext');
const fsextra = require('fs-extra');

exports.EOF = -1
exports.SEEK_SET = 0;
exports.SEEK_CUR = 1;
exports.SEEK_END = 2;

exports.open = fsextra.open;
exports.close = fsextra.close;

exports.read = async function(fd, buf, off, len) {
	return (await fsextra.read(fd, buf, off, len)).bytesRead;
};

exports.write = async function(fd, buf, off, len) {
	return (await fsextra.write(fd, buf, off, len)).bytesWritten;
};

exports.seek = function(fd, off, whence) {
	return new Promise((resolve, reject) => {
		fsext.seek(fd, off, whence, (err, pos) => {
			if (err) {
				return reject(err);
			} else {
				resolve(pos);
			}
		})
	});
};

exports.Fdio = function(fd) {
	this.fd = fd;

	this.close = async function() {
		return await exports.close(this.fd);
	};

	this.read = async function(buf, off, len) {
		return await exports.read(this.fd, buf, off, len);
	};

	this.write = async function(buf, off, len) {
		return await exports.write(this.fd, buf, off, len);
	};

	this.seek = async function(off, whence) {
		return await exports.seek(this.fd, off, whence);
	};

	this.flush = async function() {

	};
}

exports.Memio = function(b) {
	if (arguments.length == 0) {
		this.buf = Buffer.alloc(1000);
		this.fpos = 0;
		this.end = 0;
	} else {
		this.buf = b;
		this.fpos = 0;
		this.end = b.length;
	}

	this.close = async function() {

	};

	this.read = async function(buf, off, len) {
		len = Math.min(len, this.end - this.fpos);
		this.buf.copy(buf, off, this.fpos, this.fpos + len);
		this.fpos += len;
		return len;
	};

	this.write = async function(buf, off, len) {
		if (this.fpos + len > this.buf.length) {
			let grow = Buffer.alloc(this.fpos + len + 1000);
			this.buf.copy(grow, 0, 0, this.end);
			this.buf = grow;
		}

		buf.copy(this.buf, this.fpos, off, off + len);
		this.fpos += len;
		if (this.fpos > this.end) {
			this.end = this.fpos;
		}
	};

	this.seek = async function(off, whence) {
		if (whence == exports.SEEK_SET && off >= 0) {
			this.fpos = off;
			return this.fpos;
		} else if (whence == exports.SEEK_CUR && fpos + off >= 0) {
			this.fpos += off;
			return this.fpos;
		} else if (whence == exports.SEEK_END && this.end + off >= 0) {
			this.fpos = this.end + off;
			return this.fpos;
		}

		let e = new Error();
		e.errno = 22;
		e.code = "EINVAL";
		throw(e);
	};

	this.flush = async function() {

	};

	this.buffer = async function() {
		return this.buf;
	};

	this.length = async function() {
		return this.end;
	};

	this.toString = async function() {
		return this.buf.toString('utf-8', 0, this.end);
	};
};

exports.File = function(stream) {
	this.stream = stream;

	this.readbuf = null;
	this.readhead = 0;
	this.readtail = 0;

	this.writebuf = null;
	this.writehead = 0;
	this.writetail = 0;

	this.ungot = null;
	this.eof = 0;

	this.read = async function(buffer, off, len) {
		let n = 0;

		while (n < len) {
			let b = await this.getb();
			if (b == this.EOF) {
				break;
			}

			buffer[off++] = b;
			n++;
		}

		return n;
	};

	this.write = async function(buffer, off, len) {
		for (let i = 0; i < len; i++) {
			await this.putb(buffer[off + i]);
		}
		return len;
	};

	this.getb = async function() {
		if (this.ungot != null) {
			let b = this.ungot.b;
			this.ungot = this.ungot.next;
			return b;
		}

		if (this.eof) {
			return exports.EOF;
		}

		if (this.readbuf == null) {
			this.readbuf = Buffer.alloc(1000);
		}

		if (this.readhead >= this.readtail) {
			this.readhead = 0;
			this.readtail = await this.stream.read(this.readbuf, 0, this.readbuf.length);
		}

		if (this.readhead >= this.readtail) {
			this.eof = true;
			return exports.EOF;
		}
	};

	this.unget = async function(b) {
		if (b >= 0) {
			this.ungot = { b: b, next: this.ungot };
		}

		return unixio.EOF;
	};

	this.putb = async function(b) {
		if (this.writebuf == null) {
			this.writebuf = Buffer.alloc(1000);
		}

		if (this.writetail >= this.writebuf.length) {
			while (this.writehead < this.writetail) {
				this.writehead += await this.stream.write(this.writebuf, this.writehead, this.writetail - this.writehead);
			}

			this.writehead = 0;
			this.writetail = 0;
		}

		this.writebuf[this.writetail++] = b;
	};

	this.flush = async function() {
		if (this.writebuf != null) {
			while (this.writehead < this.writetail) {
				this.writehead += await this.stream.write(this.writebuf, this.writehead, this.writetail - this.writehead);
			}

			this.writehead = 0;
			this.writetail = 0;
		}
	};
};
