"""用途：準備七天有效的本機 HTTPS 測試憑證。所在層：#3 手機準備。關聯：PHONE_MEDIA_CHECK.md、serve-web.ts。"""
import argparse
import ipaddress
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('address', nargs='?', help='與手機同一區網的電腦 IPv4 位址；省略時讀取 macOS 預設網路介面')
args = parser.parse_args()
if not args.address:
    # Mac 的 Wi-Fi 不一定叫 en0；讀實際路由，避免產生錯誤位址後讓手機無法連線。
    route = subprocess.run(['route', '-n', 'get', 'default'], capture_output=True, text=True)
    interface = next((line.split(':', 1)[1].strip() for line in route.stdout.splitlines() if 'interface:' in line), '')
    found = subprocess.run(['ipconfig', 'getifaddr', interface], capture_output=True, text=True)
    args.address = found.stdout.strip()
try:
    address = ipaddress.IPv4Address(args.address)
except ipaddress.AddressValueError:
    parser.error('無法讀取 IPv4 位址，請從電腦網路設定查詢後明確填入。')
if not any(address in ipaddress.ip_network(network) for network in ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']):
    parser.error('請使用同一區網的 IPv4 位址，不建立公開網站憑證。')
folder = Path(__file__).resolve().parents[1] / 'output/phone-preview'
# 不覆寫既有憑證，也不自動修改電腦／手機信任設定；安裝及移除由測試者操作。
folder.mkdir(parents=True, exist_ok=False)

def openssl(*arguments):
    result = subprocess.run(['openssl', *arguments], cwd=folder, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)

openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7', '-keyout', 'ca.key', '-out', 'ca.crt',
        '-subj', '/CN=Dance Stamp local media test CA', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
        '-addext', 'keyUsage=critical,keyCertSign,cRLSign')
openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr',
        '-subj', '/CN=Dance Stamp local media test')
(folder / 'server.ext').write_text('basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\n'
    f'extendedKeyUsage=serverAuth\nsubjectAltName=IP:{address},IP:127.0.0.1,DNS:localhost\n')
openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
        '-out', 'server.crt', '-days', '7', '-extfile', 'server.ext')
for key in folder.glob('*.key'):
    key.chmod(0o600)
print(f'憑證已備妥，未安裝信任。只將 {folder / "ca.crt"} 傳到自己的測試手機。')
print(f'手機預覽位址：https://{address}:42835/')
print(f'啟動：DANCE_STAMP_HOST={address} DANCE_STAMP_PORT=42835 DANCE_STAMP_TEST_MEDIA=1 '
      'DANCE_STAMP_TLS_CERT=output/phone-preview/server.crt DANCE_STAMP_TLS_KEY=output/phone-preview/server.key '
      'bun --no-env-file scripts/serve-web.ts')
