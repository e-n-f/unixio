#!/usr/local/bin/node

"use strict";

let unixio = require("../index.js");

async function cat(fp) {
	while (true) {
		let u = fp.getu();
		u = u instanceof Promise ? await u : u;

		if (u == unixio.EOF) {
			break;
		}

		if (false) {
			await fp.ungetu(u);
			let u2 = await fp.getu(u);
			if (u != u2) {
				throw new Error();
			}
		}

		let p = unixio.stdout.putu(u);
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

unixio.call(main);
