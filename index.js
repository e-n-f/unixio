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

