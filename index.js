'use strict';

const fsext = require('fs-ext');
const fsextra = require('fs-extra');
const tty = require('tty');

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
		return 0;
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
		return len;
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
		return 0;
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
	this.surrogate = -1;
	this.eof = false;
	this.buffered = 2;

	exports.opened.push(this);

	this.read = async function(buffer, off, len) {
		let n = 0;

		while (n < len) {
			let b = await this.getb();
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

		return this.readbuf[this.readhead++];
	};

	this.ungetb = async function(b) {
		if (b >= 0) {
			this.ungot = { b: b, next: this.ungot };
			return b;
		}

		return exports.EOF;
	};

	this.putb = async function(b) {
		if (this.writebuf == null) {
			this.writebuf = Buffer.alloc(1000);
		}

		if (this.writetail >= this.writebuf.length) {
			await this.flush();
		}

		this.writebuf[this.writetail++] = b;

		if (this.buffered == 0 || (b == 10 && this.buffered == 1)) {
			await this.flush();
		}

		return b;
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
			await this.putb(0xE0 | (this.surrogate >> 12));
			await this.putb(0x80 | ((this.surrogate >> 6) & 0x3F));
			await this.putb(0x80 | (this.surrogate & 0x3F));
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

	this.getc = async function() {
		if (this.ungot == null && this.readhead < this.readtail && this.readbuf[this.readhead] < 0x80) {
			return this.readbuf[this.readhead++];
		}

		let b = await this.getb();

		if (b < 0x80) {
			return b;
		} else if ((b & 0xE0) == 0xC0) {
			let c = (b & 0x1F) << 6;
			b = await this.getb();
			if ((b & 0xC0) == 0x80) {
				c |= (b & 0x3F);
				return c;
			}
		} else if ((b & 0xF0) == 0xE0) {
			let c = (b & 0x0F) << 12;
			b = await this.getb();
			if ((b & 0xC0) == 0x80) {
				c |= (b & 0x3F) << 6;
				b = await this.getb();
				if ((b & 0xC0) == 0x80) {
					c |= (b & 0x3F);
					return c;
				}
			}
		} else if ((b & 0xF8) == 0xF0) {
			let c = (b & 0x07) << 18;
			b = await this.getb();
			if ((b & 0xC0) == 0x80) {
				c |= (b & 0x3F) << 12;
				b = await this.getb();
				if ((b & 0xC0) == 0x80) {
					c |= (b & 0x3F) << 6;
					b = await this.getb();
					if ((b & 0xC0) == 0x80) {
						c |= (b & 0x3F);

						// UTF-16 surrogate pair
						c -= 0x010000;
						let c1 = (c >> 10) + 0xD800;
						let c2 = (c & ((1 << 10) - 1)) + 0xDC00;

						await this.ungetc(c2);
						return c1;
					}
				}
			}
		}

		await this.ilseq();
	};

	this.ungetc = async function(c) {
		if (c <= 0x7F) {
			await this.ungetb(c);
		} else if (c <= 0x7FF) {
			await this.ungetb(0x80 | (c & 0x3F));
			await this.ungetb(0xC0 | (c >> 6));
		} else {
			await this.ungetb(0x80 | (c & 0x3F));
			await this.ungetb(0x80 | ((c >> 6) & 0x3F));
			await this.ungetb(0xE0 | (c >> 12));
		}
	};

	this.gets = async function() {
		let ret = "";

		while (true) {
			let c;

			if (this.ungot == null && this.readhead < this.readtail && this.readbuf[this.readhead] < 0x80) {
				c = this.readbuf[this.readhead++];
			} else {
				c = await this.getc();
			}

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

	this.putc = async function(c) {
		if (this.surrogate >= 0) {
			if (c >= 0xDC00 && c <= 0xDFFFF) {
				let c1 = this.surrogate - 0xD800;
				let c2 = c - 0xDC00;
				this.surrogate = -1;
				c = ((c1 << 10) | c2) + 0x010000;
			} else {
				// Invalid second char of surrogate,
				// so write first char literally,
				// followed by whatever we were given

				await this.putb(0xE0 | (this.surrogate >> 12));
				await this.putb(0x80 | ((this.surrogate >> 6) & 0x3F));
				await this.putb(0x80 | (this.surrogate & 0x3F));
				this.surrogate = -1;
			}

			// Now write the reconstructed surrogate as UTF-8
		}

		if (this.writebuf != null && this.buffered > 0 && this.writetail < this.writebuf.length && c < 0x80 && c > 10) {
			this.writebuf[this.writetail++] = c;
			return c;
		}

		if (c <= 0x7F) {
			await this.putb(c);
		} else if (c <= 0x7FF) {
			await this.putb(0xC0 | (c >> 6));
			await this.putb(0x80 | (c & 0x3F));
		} else if (c <= 0xFFFF) {
			if (c >= 0xD800 && c <= 0xDBFF) {
				// First char of UTF-16 surrogate pair
				this.surrogate = c;
				return c;
			}

			await this.putb(0xE0 | (c >> 12));
			await this.putb(0x80 | ((c >> 6) & 0x3F));
			await this.putb(0x80 | (c & 0x3F));
		} else {
			await this.putb(0xF0 | (c >> 18));
			await this.putb(0x80 | ((c >> 12) & 0x3F));
			await this.putb(0x80 | ((c >> 6) & 0x3F));
			await this.putb(0x80 | (c & 0x3F));
		}

		return c;
	};

	this.puts = async function(s) {
		let i;
		for (i = 0; i < s.length; i++) {
			let c = s.charCodeAt(i);

			if (this.surrogate < 0 && this.writebuf != null && this.buffered > 0 && this.writetail < this.writebuf.length && c < 0x80 && c > 10) {
				this.writebuf[this.writetail++] = c;
			} else {
				await this.putc(c);
			}
		}
	};

	this.peekc = async function() {
		let c = await this.getc();
		await this.ungetc(c);
		return c;
	};

	this.peekb = async function() {
		let b = await this.getb();
		await this.ungetb(b);
		return b;
	};

	this.ilseq = async function() {
		let e = new Error();
		e.errno = 92; // XXX MacOS-specific?
		e.code = "EILSEQ";
		throw(e);
	}

	this.getj = async function() {
		let c;

		while (true) {
			if (this.ungot == null && this.readhead < this.readtail && this.readbuf[this.readhead] < 0x80) {
				c = this.readbuf[this.readhead++];
			} else {
				c = await this.getc();
			}

			// Ignorable whitespace
			if (c == 0x20 || c == 0x0A || c == 0x0D || c == 0x09 || c == 0x1E || c == 0xFEFF) {
				continue;
			}

			if (c == exports.EOF) {
				return null;
			}

			break;
		}

		if (c == 0x5B) {
			return "[";
		}
		if (c == 0x5D) {
			return "]";
		}
		if (c == 0x7B) {
			return "{";
		}
		if (c == 0x7D) {
			return "}";
		}
		if (c == 0x2C) {
			return ",";
		}
		if (c == 0x3A) {
			return ":";
		}

		// Barewords (null, true, false)
		if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
			let word = String.fromCharCode(c);

			while (true) {
				if (this.ungot == null && this.readhead < this.readtail && this.readbuf[this.readhead] < 0x80) {
					c = this.readbuf[this.readhead++];
				} else {
					c = await this.getc();
				}

				if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
					word += String.fromCharCode(c);
				} else {
					await this.ungetc(c);
					break;
				}
			}

			return word;
		}

		// Strings
		if (c == 0x22) {
			let str = "\"";

			while (true) {
				if (this.ungot == null && this.readhead < this.readtail && this.readbuf[this.readhead] < 0x80) {
					c = this.readbuf[this.readhead++];
				} else {
					c = await this.getc();
				}

				if (c == exports.EOF) {
					break;
				}

				if (c == 0x22) {
					str += "\"";
					break;
				} else if (c == 0x5C) {
					c = await this.getc();

					if (c == 0x22 || c == 0x5C || c == 0x2F || c == 0x62 ||
					    c == 0x66 || c == 0x6E || c == 0x72 || c == 0x74) {
						str += "\"" + String.fromCharCode(c);
					} else if (c == 0x75) {
						str += "\\u";

						let i;
						for (i = 0; i < 4; i++) {
							c = await this.getc();

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
		if ((c >= 0x30 && c <= 0x39) || c == 0x2D) { // digits, minus
			let str = "";

			if (c == 0x2D) {
				str += "-";
				c = await this.getc();
			}

			if (c == 0x30) {
				str += "0";
			} else if (c >= 0x31 && c <= 0x39) { // 1 through 9
				str += String.fromCharCode(c);
				c = await this.peekc();

				while (c >= 0x30 && c <= 0x39) {
					str += String.fromCharCode(await this.getc());
					c = await this.peekc();
				}
			}

			if ((await this.peekc()) == 0x2E) { // .
				await this.getc();
				str += ".";

				c = await this.peekc();
				if (c < 0x30 || c > 0x39) {
					await this.ilseq();
				}

				while (c >= 0x30 && c <= 0x39) {
					str += String.fromCharCode(await this.getc());
					c = await this.peekc();
				}
			}

			c = await this.peekc();
			if (c == 0x45 || c == 0x65) { // E
				str += String.fromCharCode(await this.getc());
				c = await this.peekc();

				if (c == 0x2B || c == 0x2D) { // +, -
					str += String.fromCharCode(await this.getc());
				}

				c = await this.peekc();
				if (c < 0x30 || c > 0x39) {
					await this.ilseq();
				}
				while (c >= 0x30 && c <= 0x39) {
					str += String.fromCharCode(await this.getc());
					c = await this.peekc();
				}
			}

			return str;
		}

		await this.ilseq();
	};
};

exports.opened = [];

exports.cleanup = async function() {
	while (exports.opened.length > 0) {
		await exports.opened[0].close();
	}
}

process.on('beforeExit', exports.cleanup);

exports.stdin = new exports.File(new exports.Fdio(0));
exports.stdout = new exports.File(new exports.Fdio(1));
exports.stderr = new exports.File(new exports.Fdio(2));

exports.stderr.buffered = 0;

if (tty.isatty(1)) {
	exports.stdout.buffered = 1;
}
