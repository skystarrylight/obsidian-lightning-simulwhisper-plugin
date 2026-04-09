PYTHON_BIN ?= python3
VENV_DIR ?= .venv
UV ?= uv
BRIDGE_HOST ?= 127.0.0.1
BRIDGE_PORT ?= 8765
OBSIDIAN_PLUGIN_DIR ?= $(OBSIDIAN_VAULT)/.obsidian/plugins/lightning-simulwhisper-template-driven
TEMPLATE_DEST_DIR ?= $(OBSIDIAN_VAULT)/Templates

.PHONY: bridge-venv bridge-run bridge-health plugin-install template-install check-vault

bridge-venv:
	$(UV) venv $(VENV_DIR)
	$(UV) pip install --python $(VENV_DIR)/bin/python -r packages/bridge-server/requirements.txt

bridge-run:
	@if [ -z "$(LIGHTNING_SIMULWHISPER_DIR)" ]; then echo "LIGHTNING_SIMULWHISPER_DIR is required"; exit 1; fi
	@if [ ! -x "$(VENV_DIR)/bin/uvicorn" ]; then echo "Run 'make bridge-venv' first"; exit 1; fi
	$(VENV_DIR)/bin/uvicorn --app-dir packages/bridge-server app:app --host $(BRIDGE_HOST) --port $(BRIDGE_PORT) --reload

bridge-health:
	curl http://$(BRIDGE_HOST):$(BRIDGE_PORT)/health

check-vault:
	@if [ -z "$(OBSIDIAN_VAULT)" ]; then echo "OBSIDIAN_VAULT is required"; exit 1; fi

plugin-install: check-vault
	mkdir -p "$(OBSIDIAN_PLUGIN_DIR)"
	cp packages/obsidian-plugin/main.js "$(OBSIDIAN_PLUGIN_DIR)/main.js"
	cp packages/obsidian-plugin/manifest.json "$(OBSIDIAN_PLUGIN_DIR)/manifest.json"
	cp packages/obsidian-plugin/styles.css "$(OBSIDIAN_PLUGIN_DIR)/styles.css"
	cp packages/obsidian-plugin/versions.json "$(OBSIDIAN_PLUGIN_DIR)/versions.json"
	@echo "Installed plugin into $(OBSIDIAN_PLUGIN_DIR)"

template-install: check-vault
	mkdir -p "$(TEMPLATE_DEST_DIR)"
	cp templates/raw-transcription.sample.md "$(TEMPLATE_DEST_DIR)/raw-transcription.sample.md"
	cp templates/meeting-note.sample.md "$(TEMPLATE_DEST_DIR)/meeting-note.sample.md"
	cp templates/interview-note.sample.md "$(TEMPLATE_DEST_DIR)/interview-note.sample.md"
	@echo "Installed sample templates into $(TEMPLATE_DEST_DIR)"
