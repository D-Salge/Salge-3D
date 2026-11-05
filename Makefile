# Atalhos para os scripts de package.json. As receitas usam TAB, nao espacos.
.DEFAULT_GOAL := help
.PHONY: help install dev build start prod test lint typecheck ci

# Evita que tarefas que alteram node_modules ou .next concorram com make -j.
.NOTPARALLEL:

PORT ?= 3002
ifeq ($(OS),Windows_NT)
NPM ?= npm.cmd
else
NPM ?= npm
endif

help:
	@node -e "console.log(['Salge 3D - comandos:', '  make install    Instala dependencias com npm ci', '  make dev        Inicia o desenvolvimento na porta 3002', '  make build      Gera o build de producao', '  make start      Inicia um build ja existente', '  make prod       Gera o build e inicia a producao', '  make test       Executa os testes', '  make lint       Verifica o codigo com ESLint', '  make typecheck  Verifica os tipos TypeScript', '  make ci         Executa a verificacao completa; remove .next ao terminar', '', 'Outra porta: make dev PORT=3000 ou make prod PORT=3000', 'Encerre o servidor com Ctrl+C.'].join('\n'))"

install:
	$(NPM) ci

dev:
	$(NPM) run dev -- --port "$(PORT)"

build:
	$(NPM) run build

start:
	$(NPM) start -- --port "$(PORT)"

# O build precisa terminar com sucesso antes de iniciar o servidor.
prod: build
	$(NPM) start -- --port "$(PORT)"

test:
	$(NPM) test

lint:
	$(NPM) run lint

typecheck:
	$(NPM) run typecheck

ci:
	$(NPM) run ci
