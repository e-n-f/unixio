var fs = require('fs');

exports.access = function(name, mode) {
	try {
		fs.accessSync(name, mode);
		return 0;
	} catch (e) {
		// XXX set errno
		return -1;
	}
};

exports.F_OK = fs.F_OK;
exports.R_OK = fs.R_OK;
exports.W_OK = fs.W_OK;
exports.X_OK = fs.X_OK;

// alarm?
// brk?

exports.chdir = function(name) {
	try {
		process.chdir(name);
		return 0;
	} catch (e) {
		// XXX set errno
		return -1;
	}
}

// chroot?
