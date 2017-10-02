#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function cat(fp) {
	let depth = 0;

	while (true) {
		let s = fp.getj();
		s = s instanceof Promise ? await s : s;

		if (s == null) {
			break;
		}

		let out = "";

		if (s == '{' || s == '[') {
			depth++;
		}
		if (s == '}' || s == ']') {
			depth--;

			out += "\n";
			let i;
			for (i = 0; i < depth; i++) {
				out += "\t";
			}
		}

		out += s;

		if (s == '[' || s == '{' || s == ',') {
			out += "\n";
			let i;
			for (i = 0; i < depth; i++) {
				out += "\t";
			}
		}

		let p = unixio.stdout.puts(out);
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

main().then(function() {
	;
}, function(err) {
	console.error(err);
	process.exit(1);
});
