#!/usr/bin/env bash
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
cd /Users/lining/程序/workspace/ningyi-ai/hermes-test/server
exec npx tsx src/index.ts
