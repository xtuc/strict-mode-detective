.PHONY: test

define run_test
    echo $(1) && \
    node ./index.js $(1) > $(1).expected
endef

test:
	@for file in $(shell find ./test -type f -name "*.js"); \
	  do $(call run_test, $$file); done
