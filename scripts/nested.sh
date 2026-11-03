#!/usr/bin/env bash
# hide: nested .git -> .git_nested (so root git tracks the files). show: reverse.
cd "$HOME/workspace" || exit 0
case "$1" in
  hide)
    find . -mindepth 2 -name .git -not -path './.git/*' -not -path '*/node_modules/*' -prune -print0 |
    while IFS= read -r -d '' g; do [ -e "${g%.git}.git_nested" ] || mv "$g" "${g%.git}.git_nested"; done ;;
  show)
    find . -mindepth 2 -name .git_nested -not -path './.git/*' -prune -print0 |
    while IFS= read -r -d '' g; do [ -e "${g%.git_nested}.git" ] || mv "$g" "${g%.git_nested}.git"; done ;;
esac
exit 0
