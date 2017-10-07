#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function cat(fp) {
	while (true) {
		let b = fp.getb();
		b = b instanceof Promise ? await b : b;

		if (b == unixio.EOF) {
			break;
		}

		let p = unixio.stdout.putb(b);
		p = p instanceof Promise ? await p : p;
	}
}

async function main() {
	if (process.argv.length > 2) {
		let i;
		for (i = 2; i < process.argv.length; i++) {
			let fp = await unixio.fopen(process.argv[i], "r");
			await cat(fp);
			await fp.close();
		}
	} else {
		await cat(unixio.stdin);
	}
}

unio.call(main);
