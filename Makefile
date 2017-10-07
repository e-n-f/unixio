all:

SRCS = index.js $(wildcard tests/*.js)

indent:
	for i in $(SRCS); do prettier --use-tabs --write --print-width 150 --tab-width 8 $$i; done
