#!/usr/bin/env bash
set -euo pipefail

EMULATOR_NAME="test_device"
BOOT_TIMEOUT=120
DEV_SERVER_PORT=8080
PORT_RANGE_START=9200
PORT_RANGE_END=9400

echo "Starting Android emulator: ${EMULATOR_NAME}"
emulator -avd "${EMULATOR_NAME}" \
  -no-window \
  -no-audio \
  -no-snapshot \
  -no-boot-anim \
  -gpu swiftshader_indirect &

EMULATOR_PID=$!

echo "Waiting for emulator to boot (timeout: ${BOOT_TIMEOUT}s)..."
SECONDS=0
while [ $SECONDS -lt $BOOT_TIMEOUT ]; do
  BOOT_COMPLETED=$(adb shell getprop sys.boot_completed 2>/dev/null || echo "")
  if [ "$BOOT_COMPLETED" = "1" ]; then
    echo "Emulator booted successfully in ${SECONDS}s"
    break
  fi
  sleep 2
done

if [ "$BOOT_COMPLETED" != "1" ]; then
  echo "ERROR: Emulator failed to boot within ${BOOT_TIMEOUT}s"
  kill $EMULATOR_PID 2>/dev/null || true
  exit 1
fi

echo "Setting up adb reverse port forwarding..."

adb reverse tcp:${DEV_SERVER_PORT} tcp:${DEV_SERVER_PORT}
echo "  Forwarded port ${DEV_SERVER_PORT} (dev server)"

for port in $(seq ${PORT_RANGE_START} ${PORT_RANGE_END}); do
  adb reverse tcp:${port} tcp:${port}
done
echo "  Forwarded ports ${PORT_RANGE_START}-${PORT_RANGE_END} (test servers)"

echo "Emulator is ready"
