'use strict';

const fs = require('fs');
const fsext = require('fs-ext');
const fsextra = require('fs-extra');

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
}

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
	if (b === undefined) {
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
		if (whence == 0 && off >= 0) { // SEEK_SET
			this.fpos = off;
			return this.fpos;
		} else if (whence == 1 && fpos + off >= 0) { // SEEK_CUR
			this.fpos += off;
			return this.fpos;
		} else if (whence == 2 && this.end + off >= 0) { // SEEK_END
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
}
