"use strict";

let unixio = require("../index.js");

let pipe = new unixio.Mempipe();

async function writeloop() {
	let i;
	for (i = 0; i < 1000; i++) {
		let s = "" + i + "\n";
		let b = Buffer.from(s);

		let n = await pipe.to.write(b, 0, b.length);

		if (i % 10 == 0) {
			await unixio.usleep(500000);
		}
	}
	await pipe.to.close();
}

async function readloop() {
	let buf = Buffer.alloc(10);
	let seq = 0;

	while (true) {
		let n = await pipe.from.read(buf, 0, 10);
		if (n == 0) {
			break;
		}
		await unixio.stdout.write(buf, 0, n);

		if (false) {
			// Intentional broken pipe
			if (seq++ == 20) {
				await pipe.from.close();
				break;
			}
		}
	}
}

function readfrom() {
	readloop().then(
		function() {},
		function(err) {
			console.error(err);
			process.exit(1);
		}
	);
}

function writeto() {
	writeloop().then(
		function() {},
		function(err) {
			console.error(err);
			process.exit(1);
		}
	);
}

setTimeout(writeto, 1000);
setTimeout(readfrom, 0);
