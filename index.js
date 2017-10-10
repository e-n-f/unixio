"use strict";

const fs = require("fs");
const fsext = require("fs-ext");
const fsextra = require("fs-extra");
const tty = require("tty");

exports.EOF = -1;
exports.SEEK_SET = 0;
exports.SEEK_CUR = 1;
exports.SEEK_END = 2;

exports.open = fsextra.open;
exports.close = fsextra.close;

exports.read = function(fd, buf, off, len) {
	return new Promise((resolve, reject) => {
		fs.read(fd, buf, off, len, null, (err, n) => {
			if (err) {
				return reject(err);
			} else {
				resolve(n);
			}
		});
	});
};

exports.write = function(fd, buf, off, len) {
	return new Promise((resolve, reject) => {
		fs.write(fd, buf, off, len, null, (err, n) => {
			if (err) {
				return reject(err);
			} else {
				resolve(n);
			}
		});
	});
};

exports.seek = function(fd, off, whence) {
	return new Promise((resolve, reject) => {
		fsext.seek(fd, off, whence, (err, pos) => {
			if (err) {
				return reject(err);
			} else {
				resolve(pos);
			}
		});
	});
};

exports.Fdio = function(fd) {
	this.fd = fd;

	this.close = function() {
		return exports.close(this.fd);
	};

	this.read = function(buf, off, len) {
		return exports.read(this.fd, buf, off, len);
	};

	this.write = function(buf, off, len) {
		return exports.write(this.fd, buf, off, len);
	};

	this.seek = function(off, whence) {
		return exports.seek(this.fd, off, whence);
	};

	this.flush = function() {};
};

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

	this.close = function() {
		return 0;
	};

	this.read = function(buf, off, len) {
		len = Math.min(len, this.end - this.fpos);
		this.buf.copy(buf, off, this.fpos, this.fpos + len);
		this.fpos += len;
		return len;
	};

	this.write = function(buf, off, len) {
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
		return len;
	};

	this.seek = function(off, whence) {
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
		throw e;
	};

	this.flush = function() {
		return 0;
	};

	this.buffer = function() {
		return this.buf;
	};

	this.length = function() {
		return this.end;
	};

	this.toString = function() {
		return this.buf.toString("utf-8", 0, this.end);
	};
};

exports.Mempipe = function() {
	this.buf = Buffer.alloc(5000);
	this.head = 0;
	this.tail = 0;
	this.waiting = null;

	this.eof = false; // if writer has closed
	this.broken = false; // if reader has closed

	this.to = {};
	this.from = {};

	this.to.seek = this.from.seek = this.to.read = this.from.write = function() {
		let e = new Error();
		e.errno = 29;
		e.code = "ESPIPE";
		throw e;
	};

	this.to.write = (buf, off, len) => {
		if (len <= 0) {
			return 0;
		}

		if (this.broken) {
			let e = new Error();
			e.errno = 32;
			e.code = "EPIPE";
			throw e;
		}

		if (this.tail + len <= this.buf.length) {
			// Append into buffer if possible

			buf.copy(this.buf, this.tail, off, off + len);
			this.tail += len;
		} else if (this.tail - this.head + len < this.buf.length) {
			// Shift buffer if possible

			this.buf.cop(this.buf, 0, this.head, this.tail);
			this.tail = this.tail - this.head;
			this.head = 0;
			buf.copy(this.buf, this.tail, off, off + len);
			this.tail += len;
		} else {
			// Grow buffer. Should writes block instead?

			let nbuf = Buffer.alloc(this.tail - this.head + len + 1000);
			this.buf.copy(nbuf, 0, this.head, this.tail);
			this.tail = this.tail - this.head;
			this.head = 0;
			this.buf = nbuf;

			buf.copy(nbuf, this.tail, off, off + len);
			this.tail += len;
		}

		if (this.waiting == null) {
			return len;
		}

		// Wake anyone who is waiting as long as more input is available

		while (this.waiting != null && this.tail > this.head) {
			let w = this.waiting;
			this.waiting = w.next;

			w.len = Math.min(w.len, this.tail - this.head);
			this.buf.copy(w.buf, w.off, this.head, this.head + w.len);
			this.head += w.len;

			setTimeout(w.resolve, 0, w.len);
		}

		return len;
	};

	this.from.read = (buf, off, len) => {
		if (this.tail > this.head) {
			len = Math.min(len, this.tail - this.head);
			this.buf.copy(buf, off, this.head, this.head + len);
			this.head += len;
			return len;
		}

		if (this.eof) {
			return 0;
		}

		return new Promise((resolve, reject) => {
			this.waiting = {
				resolve: resolve,
				buf: buf,
				off: off,
				len: len,
				next: this.waiting
			};
		});
	};

	this.from.close = () => {
		this.broken = true;
		return 0;
	};

	this.to.close = () => {
		this.eof = true;

		if (this.waiting == null) {
			return 0;
		}

		// Wake anyone who is waiting, either for final input or for EOF

		while (this.waiting != null) {
			let w = this.waiting;
			this.waiting = w.next;

			w.len = Math.min(w.len, this.tail - this.head);
			this.buf.copy(w.buf, w.off, this.head, this.head + w.len);
			this.head += w.len;

			setTimeout(w.resolve, 0, w.len);
		}

		return 0;
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
	this.surrogate = -1;
	this.eof = false;
	this.buffered = 2;

	exports.opened.push(this);

	this.read = async function(buffer, off, len) {
		let n = 0;

		while (n < len) {
			let b = this.getb();
			b = b instanceof Promise ? await b : b;

			if (b == exports.EOF) {
				break;
			}

			buffer[off++] = b;
			n++;
		}

		return n;
	};

	this.write = async function(buffer, off, len) {
		for (let i = 0; i < len; i++) {
			let b = this.putb(buffer[off + i]);
			b = b instanceof Promise ? await b : b;
		}

		return len;
	};

	this.getb = function() {
		if (this.ungot != null) {
			let b = this.ungot.b;
			this.ungot = this.ungot.next;
			return b;
		}

		if (this.eof) {
			return exports.EOF;
		}

		if (this.readbuf == null) {
			this.readbuf = Buffer.alloc(5000);
		}

		if (this.readhead < this.readtail) {
			return this.readbuf[this.readhead++];
		}

		return (async () => {
			let r = this.stream.read(this.readbuf, 0, this.readbuf.length);
			if (typeof r.then === "function") {
				r = await r;
			}

			this.readhead = 0;
			this.readtail = r;

			if (this.readhead >= this.readtail) {
				this.eof = true;
				return exports.EOF;
			}

			return this.readbuf[this.readhead++];
		})();
	};

	this.ungetb = function(b) {
		if (b >= 0) {
			this.ungot = { b: b, next: this.ungot };
			return b;
		}

		return exports.EOF;
	};

	this.putb = function(b) {
		if (this.writebuf == null) {
			this.writebuf = Buffer.alloc(5000);
		}

		if ((this.buffered == 2 || (this.buffered == 1 && b != 10)) && this.writetail < this.writebuf.length) {
			this.writebuf[this.writetail++] = b;
			return b;
		}

		return (async () => {
			if (this.writetail >= this.writebuf.length) {
				await this.flush1();
			}

			this.writebuf[this.writetail++] = b;

			if (this.buffered == 0 || (b == 10 && this.buffered == 1)) {
				await this.flush();
			}

			return b;
		})();
	};

	this.flush1 = async function() {
		if (this.writebuf != null) {
			while (this.writehead < this.writetail) {
				this.writehead += await this.stream.write(this.writebuf, this.writehead, this.writetail - this.writehead);
			}

			this.writehead = 0;
			this.writetail = 0;
		}
	};

	this.flush = async function() {
		if (this.writebuf != null) {
			while (this.writehead < this.writetail) {
				this.writehead += await this.stream.write(this.writebuf, this.writehead, this.writetail - this.writehead);
			}

			this.writehead = 0;
			this.writetail = 0;
		}

		if (this.surrogate >= 0) {
			await this.putb(0xe0 | (this.surrogate >> 12));
			await this.putb(0x80 | ((this.surrogate >> 6) & 0x3f));
			await this.putb(0x80 | (this.surrogate & 0x3f));
			this.surrogate = -1;

			await this.flush();
		}

		return 0;
	};

	this.seek = async function(off, whence) {
		if (this.writebuf != null) {
			await this.flush();
		}

		this.readhead = 0;
		this.readtail = 0;
		this.eof = false;
		this.ungot = null;

		return await this.stream.seek(off, whence);
	};

	this.close = async function() {
		if (this.writebuf != null) {
			await this.flush();
		}

		let i;
		for (i = 0; i < exports.opened.length; i++) {
			if (exports.opened[i] == this) {
				break;
			}
		}
		exports.opened.splice(i, 1);

		return await this.stream.close();
	};

	this.getc1 = function(utf32) {
		let b = this.getb();
		if (!(b instanceof Promise) && b < 0x80) {
			return b;
		}
		return (async () => {
			b = await b;

			if (b < 0x80) {
				return b;
			} else if ((b & 0xe0) == 0xc0) {
				let c = (b & 0x1f) << 6;

				let b1 = this.getb();
				b1 = b1 instanceof Promise ? await b1 : b1;

				if ((b1 & 0xc0) == 0x80) {
					c |= b1 & 0x3f;
					return c;
				} else {
					this.ungetb(b1);
					return 0xfffd;
				}
			} else if ((b & 0xf0) == 0xe0) {
				let c = (b & 0x0f) << 12;

				let b1 = this.getb();
				b1 = b1 instanceof Promise ? await b1 : b1;

				if ((b1 & 0xc0) == 0x80) {
					c |= (b1 & 0x3f) << 6;

					let b2 = this.getb();
					b2 = b2 instanceof Promise ? await b2 : b2;

					if ((b2 & 0xc0) == 0x80) {
						c |= b2 & 0x3f;
						return c;
					} else {
						this.ungetb(b2);
						this.ungetb(b1);
						return 0xfffd;
					}
				} else {
					this.ungetb(b1);
					return 0xfffd;
				}
			} else if ((b & 0xf8) == 0xf0) {
				let c = (b & 0x07) << 18;

				let b1 = this.getb();
				b1 = b1 instanceof Promise ? await b1 : b1;

				if ((b1 & 0xc0) == 0x80) {
					c |= (b1 & 0x3f) << 12;

					let b2 = this.getb();
					b2 = b2 instanceof Promise ? await b2 : b2;

					if ((b2 & 0xc0) == 0x80) {
						c |= (b2 & 0x3f) << 6;

						let b3 = this.getb();
						b3 = b3 instanceof Promise ? await b3 : b3;

						if ((b3 & 0xc0) == 0x80) {
							c |= b3 & 0x3f;

							if (utf32) {
								return c;
							} else {
								// UTF-16 surrogate pair
								c -= 0x010000;
								let c1 = (c >> 10) + 0xd800;
								let c2 = (c & ((1 << 10) - 1)) + 0xdc00;

								c = this.ungetc(c2);
								c = c instanceof Promise ? await c : c;

								return c1;
							}
						} else {
							this.ungetb(b3);
							this.ungetb(b2);
							this.ungetb(b1);
							return 0xfffd;
						}
					} else {
						this.ungetb(b2);
						this.ungetb(b1);
						return 0xfffd;
					}
				} else {
					this.ungetb(b1);
					return 0xfffd;
				}
			} else {
				return 0xfffd;
			}

			await this.ilseq();
		})();
	};

	this.getc = function() {
		return this.getc1(false);
	};

	this.getu = function() {
		return this.getc1(true);
	};

	this.ungetc = this.ungetu = function(c) {
		// This knows that this.ungetb() is synchronous

		if (c <= 0x7f) {
			this.ungetb(c);
		} else if (c <= 0x7ff) {
			this.ungetb(0x80 | (c & 0x3f));
			this.ungetb(0xc0 | (c >> 6));
		} else if (c <= 0xffff) {
			this.ungetb(0x80 | (c & 0x3f));
			this.ungetb(0x80 | ((c >> 6) & 0x3f));
			this.ungetb(0xe0 | (c >> 12));
		} else {
			this.ungetb(0x80 | (c & 0x3f));
			this.ungetb(0x80 | ((c >> 6) & 0x3f));
			this.ungetb(0x80 | ((c >> 12) & 0x3f));
			this.ungetb(0xf0 | (c >> 18));
		}

		return c;
	};

	this.gets = async function() {
		let ret = "";

		while (true) {
			let c = this.getc();
			c = c instanceof Promise ? await c : c;

			if (c == exports.EOF) {
				break;
			}

			ret += String.fromCharCode(c);

			if (c == 10) {
				break;
			}
		}

		if (ret.length == 0) {
			return null;
		} else {
			return ret;
		}
	};

	this.putc = this.putu = function(c) {
		if (this.surrogate < 0 && c < 0x80) {
			// Either the actual byte put, or the Promise to do it
			return this.putb(c);
		}

		return (async () => {
			if (this.surrogate >= 0) {
				if (c >= 0xdc00 && c <= 0xdffff) {
					let c1 = this.surrogate - 0xd800;
					let c2 = c - 0xdc00;
					this.surrogate = -1;
					c = ((c1 << 10) | c2) + 0x010000;
				} else {
					// Invalid second char of surrogate,
					// so write first char literally,
					// followed by whatever we were given

					await this.putb(0xe0 | (this.surrogate >> 12));
					await this.putb(0x80 | ((this.surrogate >> 6) & 0x3f));
					await this.putb(0x80 | (this.surrogate & 0x3f));
					this.surrogate = -1;
				}

				// Now write the reconstructed surrogate as UTF-8
			}

			let t;
			if (c <= 0x7f) {
				t = this.putb(c);
				t = t instanceof Promise ? await t : t;
			} else if (c <= 0x7ff) {
				t = this.putb(0xc0 | (c >> 6));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | (c & 0x3f));
				t = t instanceof Promise ? await t : t;
			} else if (c <= 0xffff) {
				if (c >= 0xd800 && c <= 0xdbff) {
					// First char of UTF-16 surrogate pair
					this.surrogate = c;
					return c;
				}

				t = this.putb(0xe0 | (c >> 12));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | ((c >> 6) & 0x3f));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | (c & 0x3f));
				t = t instanceof Promise ? await t : t;
			} else {
				t = this.putb(0xf0 | (c >> 18));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | ((c >> 12) & 0x3f));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | ((c >> 6) & 0x3f));
				t = t instanceof Promise ? await t : t;

				t = this.putb(0x80 | (c & 0x3f));
				t = t instanceof Promise ? await t : t;
			}

			return c;
		})();
	};

	this.puts = async function(s) {
		let i;
		for (i = 0; i < s.length; i++) {
			let c = this.putc(s.charCodeAt(i));
			c = c instanceof Promise ? await c : c;
		}
	};

	this.peekb = function() {
		let b = this.getb();
		if (b instanceof Promise) {
			return (async () => {
				b = await b;
				// Knows that ungetb() is synchronous;
				return this.ungetb(b);
			})();
		}

		// Knows that ungetb() is synchronous;
		return this.ungetb(b);
	};

	this.peekc = function() {
		let c = this.getc();
		if (c instanceof Promise) {
			return (async () => {
				c = await c;
				// Knows that ungetc() is synchronous;
				return this.ungetc(c);
			})();
		}

		// Knows that ungetc() is synchronous;
		return this.ungetc(c);
	};

	this.peeku = function() {
		let c = this.getu();
		if (c instanceof Promise) {
			return (async () => {
				c = await c;
				// Knows that ungetc() is synchronous;
				return this.ungetu(c);
			})();
		}

		// Knows that ungetc() is synchronous;
		return this.ungetu(c);
	};

	this.ilseq = async function() {
		let e = new Error();
		e.errno = 92; // XXX MacOS-specific?
		e.code = "EILSEQ";
		throw e;
	};

	this.getj = async function() {
		let c;

		while (true) {
			c = this.getc();
			c = c instanceof Promise ? await c : c;

			// Ignorable whitespace
			if (c == 0x20 || c == 0x0a || c == 0x0d || c == 0x09 || c == 0x1e || c == 0xfeff) {
				continue;
			}

			if (c == exports.EOF) {
				return null;
			}

			break;
		}

		if (c == 0x5b) {
			return "[";
		}
		if (c == 0x5d) {
			return "]";
		}
		if (c == 0x7b) {
			return "{";
		}
		if (c == 0x7d) {
			return "}";
		}
		if (c == 0x2c) {
			return ",";
		}
		if (c == 0x3a) {
			return ":";
		}

		// Barewords (null, true, false)
		if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
			let word = String.fromCharCode(c);

			while (true) {
				c = this.getc();
				c = c instanceof Promise ? await c : c;

				if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
					word += String.fromCharCode(c);
				} else {
					c = this.ungetc(c);
					c = c instanceof Promise ? await c : c;
					break;
				}
			}

			return word;
		}

		// Strings
		if (c == 0x22) {
			let str = '"';

			while (true) {
				c = this.getc();
				c = c instanceof Promise ? await c : c;

				if (c == exports.EOF) {
					break;
				}

				if (c == 0x22) {
					str += '"';
					break;
				} else if (c == 0x5c) {
					c = this.getc();
					c = c instanceof Promise ? await c : c;

					if (c == 0x22 || c == 0x5c || c == 0x2f || c == 0x62 || c == 0x66 || c == 0x6e || c == 0x72 || c == 0x74) {
						str += '"' + String.fromCharCode(c);
					} else if (c == 0x75) {
						str += "\\u";

						let i;
						for (i = 0; i < 4; i++) {
							c = this.getc();
							c = c instanceof Promise ? await c : c;

							if ((c >= 0x30 && c <= 39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66)) {
								str += String.fromCharCode(c);
							} else {
								await this.ilseq();
							}
						}
					} else {
						await this.ilseq();
					}
				} else if (c < 0x20) {
					await this.ilseq();
				} else {
					str += String.fromCharCode(c);
				}
			}

			return str;
		}

		// Numbers
		if ((c >= 0x30 && c <= 0x39) || c == 0x2d) {
			// digits, minus
			let str = "";

			if (c == 0x2d) {
				str += "-";
				c = this.getc();
				c = c instanceof Promise ? await c : c;
			}

			if (c == 0x30) {
				str += "0";
			} else if (c >= 0x31 && c <= 0x39) {
				// 1 through 9
				str += String.fromCharCode(c);
				c = this.peekc();
				c = c instanceof Promise ? await c : c;

				while (c >= 0x30 && c <= 0x39) {
					c = this.getc();
					c = c instanceof Promise ? await c : c;
					str += String.fromCharCode(c);

					c = this.peekc();
					c = c instanceof Promise ? await c : c;
				}
			}

			c = this.peekc();
			c = c instanceof Promise ? await c : c;
			if (c == 0x2e) {
				// .
				c = this.getc();
				c = c instanceof Promise ? await c : c;
				str += ".";

				c = this.peekc();
				c = c instanceof Promise ? await c : c;
				if (c < 0x30 || c > 0x39) {
					await this.ilseq();
				}

				while (c >= 0x30 && c <= 0x39) {
					c = this.getc();
					c = c instanceof Promise ? await c : c;
					str += String.fromCharCode(c);

					c = this.peekc();
					c = c instanceof Promise ? await c : c;
				}
			}

			c = this.peekc();
			c = c instanceof Promise ? await c : c;
			if (c == 0x45 || c == 0x65) {
				// E
				c = this.getc();
				c = c instanceof Promise ? await c : c;
				str += String.fromCharCode(c);

				c = this.peekc();
				c = c instanceof Promise ? await c : c;

				if (c == 0x2b || c == 0x2d) {
					// +, -
					c = this.getc();
					c = c instanceof Promise ? await c : c;
					str += String.fromCharCode(c);
				}

				c = this.peekc();
				c = c instanceof Promise ? await c : c;
				if (c < 0x30 || c > 0x39) {
					await this.ilseq();
				}
				while (c >= 0x30 && c <= 0x39) {
					c = this.getc();
					c = c instanceof Promise ? await c : c;
					str += String.fromCharCode(c);

					c = this.peekc();
					c = c instanceof Promise ? await c : c;
				}
			}

			return str;
		}

		await this.ilseq();
	};
};

exports.fopen = async function(fname, flags, mode) {
	let fd = await exports.open(fname, flags, mode);

	return new exports.File(new exports.Fdio(fd));
};

exports.opened = [];

exports.cleanup = async function() {
	while (exports.opened.length > 0) {
		await exports.opened[0].close();
	}
};

process.on("beforeExit", exports.cleanup);

exports.stdin = new exports.File(new exports.Fdio(0));
exports.stdout = new exports.File(new exports.Fdio(1));
exports.stderr = new exports.File(new exports.Fdio(2));

exports.stderr.buffered = 0;

if (tty.isatty(1)) {
	exports.stdout.buffered = 1;
}

exports.usleep = function(n) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve();
		}, n / 1000);
	});
};

exports.getopt = async function(plain, withargs) {
	let argv = process.argv;

	let optind;
	for (optind = 2; optind < argv.length; optind++) {
		if (argv[optind] === "--") {
			optind++;
			break;
		} else if (argv[optind] === "-") {
			break;
		} else if (argv[optind].startsWith("--")) {
			let ix = argv[optind].indexOf("=");
			if (ix >= 0) {
				let trunc = argv[optind].substr(0, ix);
				if (trunc in withargs) {
					await withargs[trunc](argv[optind].substr(ix + 1));
				} else {
					let e = new Error("Unknown option " + trunc);
					e.unknown = argv[optind];
					e.optind = optind;
					throw e;
				}
			} else if (argv[optind] in plain) {
				await plain[argv[optind]]();
			} else if (argv[optind] in withargs) {
				if (optind + 1 < argv.length) {
					await withargs[argv[optind]](argv[optind + 1]);
					optind++;
				} else {
					let e = new Error("No argument given for " + argv[optind]);
					e.unknown = argv[optind];
					e.optind = optind;
					throw e;
				}
			} else {
				let e = new Error("Unknown option " + argv[optind]);
				e.unknown = argv[optind];
				e.optind = optind;
				throw e;
			}
		} else if (argv[optind].startsWith("-")) {
			let trunc = argv[optind].substr(0, 2);
			if (trunc in plain) {
				await plain[trunc]();

				if (argv[optind].length > 2) {
					argv[optind] = "-" + argv[optind].substr(2);
					optind--;
				}
			} else if (trunc in withargs) {
				if (argv[optind].length > 2) {
					await withargs[trunc](argv[optind].substr(2));
				} else if (optind + 1 < argv.length) {
					await withargs[trunc](argv[optind + 1]);
					optind++;
				} else {
					let e = new Error("No argument given for " + trunc);
					e.unknown = argv[optind];
					e.optind = optind;
					throw e;
				}
			} else {
				let e = new Error("Unknown option " + argv[optind]);
				e.unknown = argv[optind];
				e.optind = optind;
				throw e;
			}
		} else {
			break;
		}
	}

	return optind;
};

exports.call = function(f) {
	let arg = Array.from(arguments);
	arg.splice(0, 1);

	let ret = f(...arg);
	if (ret instanceof Promise) {
		ret.then(
			function() {},
			function(err) {
				console.error(err);
				process.exit(1);
			}
		);
	}
};
