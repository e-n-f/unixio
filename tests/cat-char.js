#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function main() {
	while (true) {
		let c = unixio.stdin.getc();
		c = c instanceof Promise ? await c : c;

		if (c == unixio.EOF) {
			break;
		}

		let p = unixio.stdout.putc(c);
		p = p instanceof Promise ? await p : p;
	}
}

main().then(function() {
	;
}, function(err) {
	console.error(err);
	process.exit(1);
});
