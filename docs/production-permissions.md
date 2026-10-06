# Production Permission Baseline

## HRIS Next.js Production

### Runtime user

The production hris.service runs as:

- User: hris
- Group: hris

Configured through:

/etc/systemd/system/hris.service.d/override.conf

### Next.js cache

Production Next.js requires write access to:

/opt/hris/.next/cache

Approved ownership:

Owner: hris-agent
Group: hris
Mode: 775

The group must remain hris because the production service runs as hris:hris.

Verification:

sudo -u hris test -w /opt/hris/.next/cache

Expected result: PASS

### Deployment rule

Do not recursively change ownership of /opt/hris/.next.
Do not use chmod -R 777 on the production artifact.
Do not change the production service back to root.

If a future deployment recreates .next, ensure the cache directory is writable by the hris service user.

### Current production baseline

BUILD_ID: ZYqFKYkwYsk1L5bRETBlF
