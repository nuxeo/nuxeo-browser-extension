include make.d/make.mk
include make.d/version.mk
include make.d/nexus.mk

in-ci ?= $(in-cluster)

workspace: ## setup workspace, including npm and environment variables

install-and-build: install build

install:
	npm $(if $(filter false,$(in-ci)),install,ci)

.PHONY:install

build:
	npm run build

.PHONY:build

test:
	npm run test

.PHONY:test
