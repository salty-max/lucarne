#!/usr/bin/env bash
#
# Keep asking Oracle for an Always Free Ampere instance until one is free.
# "Out of host capacity" is the normal state for VM.Standard.A1.Flex, not an
# error in your request — this rotates across availability domains and retries.
#
#   brew install oci-cli && oci setup config      # once
#   bash scripts/oci-launch.sh
#
# Everything except the SSH key is discovered from your tenancy: the compartment
# comes from ~/.oci/config, and the newest Ubuntu 24.04 aarch64 image and the
# public subnet are looked up. Retries only on capacity errors — anything else
# (bad credentials, quota, wrong OCID) aborts rather than looping forever on a
# mistake that will never resolve itself.
#
# On a laptop that sleeps, wrap it:  caffeinate -i bash scripts/oci-launch.sh
#
# NOTE: this one is not covered by any test — it needs a real tenancy to run
# against. Read it before trusting it.

set -uo pipefail

NAME="${NAME:-lucarne}"
SHAPE="${SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCPUS:-1}"
MEM_GB="${MEM_GB:-6}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519.pub}"
# 3 minutes between rounds. Capacity does not free up on a 60-second granularity,
# and Oracle rate-limits LaunchInstance — a throttled account creates nothing at
# all, so polling harder is strictly worse than polling patiently.
INTERVAL="${INTERVAL:-180}"
MAX_BACKOFF="${MAX_BACKOFF:-1800}"   # 30 min ceiling once throttled
BOOT_GB="${BOOT_GB:-50}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

command -v oci >/dev/null || die "OCI CLI not installed (brew install oci-cli, then: oci setup config)"
[ -r "$HOME/.oci/config" ] || die "no ~/.oci/config — run: oci setup config"
[ -r "$SSH_KEY" ] || die "no SSH public key at $SSH_KEY"

# Root compartment == tenancy OCID, which the CLI config already holds.
COMPARTMENT="${COMPARTMENT:-$(awk -F= '/^tenancy/ {gsub(/ /,"",$2); print $2}' "$HOME/.oci/config" | head -1)}"
[ -n "$COMPARTMENT" ] || die "could not read the tenancy OCID from ~/.oci/config"

say "Discovering availability domains"
# read loop rather than mapfile: this one runs on the operator's Mac, where
# /bin/bash is still 3.2.
ADS=()
while IFS= read -r line; do
  [ -n "$line" ] && ADS+=("$line")
done < <(oci iam availability-domain list --compartment-id "$COMPARTMENT" \
  --query 'data[].name' --raw-output 2>/dev/null | tr -d '[]"," ' | grep -v '^$')
[ "${#ADS[@]}" -gt 0 ] || die "no availability domains returned — check your credentials"
printf '  %s\n' "${ADS[@]}"

say "Finding the newest Ubuntu 24.04 aarch64 image for $SHAPE"
IMAGE=$(oci compute image list --compartment-id "$COMPARTMENT" \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
  --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].id' --raw-output 2>/dev/null)
[ -n "$IMAGE" ] && [ "$IMAGE" != null ] || die "no ARM Ubuntu 24.04 image found for $SHAPE"
echo "  $IMAGE"

say "Finding a public subnet"
SUBNET="${SUBNET:-$(oci network subnet list --compartment-id "$COMPARTMENT" \
  --query 'data[?"prohibit-public-ip-on-vnic"==`false`] | [0].id' --raw-output 2>/dev/null)}"
[ -n "$SUBNET" ] && [ "$SUBNET" != null ] \
  || die "no public subnet found — run the VCN Wizard (VCN with Internet Connectivity) first"
echo "  $SUBNET"

metadata=$(printf '{"ssh_authorized_keys":"%s"}' "$(tr -d '\n' < "$SSH_KEY")")
shape_config=$(printf '{"ocpus":%s,"memoryInGBs":%s}' "$OCPUS" "$MEM_GB")

say "Launching $NAME ($OCPUS OCPU / $MEM_GB GB). Ctrl-C to stop."
attempt=0
backoff=0
while :; do
  for ad in "${ADS[@]}"; do
    attempt=$((attempt + 1))
    out=$(oci compute instance launch \
      --availability-domain "$ad" \
      --compartment-id "$COMPARTMENT" \
      --shape "$SHAPE" \
      --shape-config "$shape_config" \
      --image-id "$IMAGE" \
      --subnet-id "$SUBNET" \
      --boot-volume-size-in-gbs "$BOOT_GB" \
      --assign-public-ip true \
      --display-name "$NAME" \
      --metadata "$metadata" \
      --wait-for-state RUNNING 2>&1)
    rc=$?

    if [ $rc -eq 0 ]; then
      id=$(printf '%s' "$out" | sed -n 's/.*"id": "\(ocid1\.instance[^"]*\)".*/\1/p' | head -1)
      say "Instance is RUNNING after $attempt attempt(s) in $ad"
      ip=$(oci compute instance list-vnics --instance-id "$id" \
             --query 'data[0]."public-ip"' --raw-output 2>/dev/null)
      echo "  public IP: ${ip:-check the console}"
      echo "  ssh ubuntu@${ip:-<IP>}"
      exit 0
    fi

    # Only capacity is worth waiting out. Anything else is a real problem and
    # retrying it just hides the message.
    if printf '%s' "$out" | grep -qiE 'too ?many ?requests|429|rate ?limit'; then
      # Being throttled means the previous pace was already too fast. Back off
      # hard rather than digging in: a limited account launches nothing.
      backoff=$(( backoff == 0 ? INTERVAL * 2 : backoff * 2 ))
      [ "$backoff" -gt "$MAX_BACKOFF" ] && backoff=$MAX_BACKOFF
      printf '  [%s] rate-limited by Oracle — backing off %ss\n' "$(date +%H:%M:%S)" "$backoff"
      sleep "$backoff"
      continue
    elif printf '%s' "$out" | grep -qiE 'out of host capacity|outofcapacity|too busy'; then
      printf '  [%s] %s — no capacity\n' "$(date +%H:%M:%S)" "$ad"
      backoff=0        # normal answer, so the earlier pace was acceptable
    else
      printf '%s\n' "$out" >&2
      die "launch failed for a reason other than capacity (see above)"
    fi
  done
  sleep "$INTERVAL"
done
