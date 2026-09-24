#!/bin/sh
set -e

DATA_DIRECTORY="${DATA_DIR:-/data}"

# Ensure data directory and backup directory exist
mkdir -p "$DATA_DIRECTORY"
mkdir -p "$DATA_DIRECTORY/backups"

# If running as root (container startup), fix permissions on mounted host volumes
if [ "$(id -u)" = "0" ]; then
    # Fix ownership of data directory for user node (UID 1000)
    chown -R node:node "$DATA_DIRECTORY" 2>/dev/null || true
    chmod -R 775 "$DATA_DIRECTORY" 2>/dev/null || chmod -R 777 "$DATA_DIRECTORY" 2>/dev/null || true
    
    # Also ensure any existing sqlite files have write permissions
    if [ -f "$DATA_DIRECTORY/kawaii_budget.sqlite" ]; then
        chmod 666 "$DATA_DIRECTORY"/kawaii_budget.sqlite* 2>/dev/null || true
    fi

    # Drop root privileges and execute as node user
    exec su-exec node "$@"
fi

exec "$@"
