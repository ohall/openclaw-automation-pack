# OpenClaw Automation Pack
# Common commands via make

.PHONY: help lint test hacs-update disable-orphans logscan

help:
	@echo "Available targets:"
	@echo "  lint           - Check syntax of all .mjs scripts"
	@echo "  test           - Run basic tests"
	@echo "  hacs-update    - Run HACS updater script"
	@echo "  disable-orphans - Disable orphan Hubitat entities"
	@echo "  logscan        - Scan HA logs for errors"

lint:
	npm run lint

test:
	npm test

hacs-update:
	npm run hacs:update

disable-orphans:
	npm run hubitat:disable-orphans

logscan:
	npm run ha:logscan