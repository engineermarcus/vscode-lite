export LANG=C.UTF-8 LC_ALL=C.UTF-8

HISTFILE=~/.zsh_history; HISTSIZE=5000; SAVEHIST=5000
setopt AUTO_CD HIST_IGNORE_DUPS SHARE_HISTORY PROMPT_SUBST
autoload -Uz compinit && compinit -q

alias ll='ls -alF' la='ls -A' l='ls -CF'

for p in zsh-autosuggestions zsh-syntax-highlighting; do
  [ -f "$HOME/.zsh-plugins/$p/$p.zsh" ] && source "$HOME/.zsh-plugins/$p/$p.zsh"
done

autoload -Uz vcs_info
zstyle ':vcs_info:git:*' formats '%F{white}[%F{yellow}%b%F{white}]%f'
precmd() { vcs_info }

_U="${GH_USER:-$(git config --get github.user 2>/dev/null)}"
_U="${_U:-Z}"

PROMPT='%B%F{white}┌──(%F{green}${_U}%F{white}@sh %F{cyan}%(3~|…/%2~|%~)%F{white})%f%b
%B%F{white}└─%b${vcs_info_msg_0_}%B%F{white}~$%f%b '
