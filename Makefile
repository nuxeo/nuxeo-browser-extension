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

gulp-command = npx gulp

release: ## Make release
release: set-version create-release

set-version: # Create a change-set and tag it (version can be overridden with `version-tag=vX.X.X`).
set-version: $(call version-if-release,,set-version~do)

set-version~do:
	@: $(info Set version $(version-tag))
	export TAG_VERSION = $(version-tag)

create-release:
	@: $(info Create release $(version-tag))
	$(gulp-command) release

publish-release-gh:
	gh release create $(version-tag) ./package/*/*.zip --title 'Nuxeo Browser Extension ${version-tag}' -n '    Release Note - Browser Developer Extensions - Version $(version-tag)'