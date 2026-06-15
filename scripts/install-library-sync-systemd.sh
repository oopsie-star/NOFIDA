#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SYSTEMD_DIR="${REPO_ROOT}/systemd"
TARGET_DIR="/etc/systemd/system"
RUN_NOW="${1:-}"

install -d -m 0755 "${TARGET_DIR}"
install -m 0644 "${SYSTEMD_DIR}/nofida-library-sync.service" "${TARGET_DIR}/nofida-library-sync.service"
install -m 0644 "${SYSTEMD_DIR}/nofida-library-sync.timer" "${TARGET_DIR}/nofida-library-sync.timer"

systemctl daemon-reload
systemctl enable --now nofida-library-sync.timer

if [[ "${RUN_NOW}" == "--run-now" ]]; then
  systemctl start nofida-library-sync.service
fi

systemctl status --no-pager nofida-library-sync.timer
