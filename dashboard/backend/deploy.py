"""
deploy.py — AOM Dashboard API: AWS Otomatik Kurulum
====================================================
Bu script şunları yapar:
  1. Lambda fonksiyonu oluşturur (veya günceller)
  2. IAM rolü oluşturur (Lambda için DynamoDB okuma izni)
  3. API Gateway HTTP API oluşturur
  4. /dashboard/summary route'unu Lambda'ya bağlar
  5. CORS ayarlar
  6. config.js'i otomatik günceller
"""

import boto3, json, zipfile, io, os, re, time, sys, argparse

REGION      = "me-central-1"
FUNC_NAME   = "aom-dashboard-api"
ROLE_NAME   = "aom-dashboard-role"
API_NAME    = "aom-dashboard"
TABLE_NAME  = "EDGE-OPS_DB"

# Komut satırı argümanları
parser = argparse.ArgumentParser(description="AOM Dashboard AWS Deploy")
parser.add_argument("--role-arn", default=None,
    help="Mevcut Lambda execution role ARN'i (verilirse IAM adımı atlanır)")
ARGS = parser.parse_args()

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
LAMBDA_SRC  = os.path.join(SCRIPT_DIR, "aom-dashboard-api.py")
CONFIG_JS   = os.path.join(SCRIPT_DIR, "..", "assets", "js", "config.js")

# ──────────────────────────────────────────────
session  = boto3.Session(region_name=REGION)
iam      = session.client("iam")
lam      = session.client("lambda")
apigw    = session.client("apigatewayv2")
sts      = session.client("sts")

def log(msg):  print(f"  {msg}")
def ok(msg):   print(f"  [OK] {msg}")
def info(msg): print(f"  --> {msg}")

# ──────────────────────────────────────────────
def get_account_id():
    return sts.get_caller_identity()["Account"]

# ──────────────────────────────────────────────
def ensure_iam_role():
    print("\n[1/4] IAM Rolü")
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    })
    try:
        r = iam.create_role(
            RoleName=ROLE_NAME,
            AssumeRolePolicyDocument=trust,
            Description="AOM Dashboard Lambda role"
        )
        role_arn = r["Role"]["Arn"]
        ok(f"Rol oluşturuldu: {role_arn}")
    except iam.exceptions.EntityAlreadyExistsException:
        role_arn = iam.get_role(RoleName=ROLE_NAME)["Role"]["Arn"]
        ok(f"Rol zaten var: {role_arn}")

    # DynamoDB ReadOnly + CloudWatch Logs politikaları
    policies = [
        "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ]
    for p in policies:
        try:
            iam.attach_role_policy(RoleName=ROLE_NAME, PolicyArn=p)
            ok(f"Politika eklendi: {p.split('/')[-1]}")
        except Exception:
            pass  # zaten ekli

    log("Rol politikaların yayılması bekleniyor (10s)...")
    time.sleep(10)
    return role_arn

# ──────────────────────────────────────────────
def zip_lambda():
    """Lambda kaynak kodunu ZIP'e paketle."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(LAMBDA_SRC, "lambda_function.py")
    buf.seek(0)
    return buf.read()

def ensure_lambda(role_arn):
    print("\n[2/4] Lambda Fonksiyonu")
    code = zip_lambda()

    try:
        r = lam.create_function(
            FunctionName=FUNC_NAME,
            Runtime="python3.12",
            Role=role_arn,
            Handler="lambda_function.lambda_handler",
            Code={"ZipFile": code},
            Timeout=15,
            MemorySize=256,
            Description="AOM Dashboard API — DynamoDB okuma",
            Environment={"Variables": {"TABLE_NAME": TABLE_NAME, "REGION": REGION}},
        )
        func_arn = r["FunctionArn"]
        ok(f"Lambda oluşturuldu: {func_arn}")
        # Aktif olmasını bekle
        log("Lambda'nın aktive olması bekleniyor...")
        lam.get_waiter("function_active").wait(FunctionName=FUNC_NAME)
    except lam.exceptions.ResourceConflictException:
        # Güncelle
        lam.update_function_code(FunctionName=FUNC_NAME, ZipFile=code)
        func_arn = lam.get_function(FunctionName=FUNC_NAME)["Configuration"]["FunctionArn"]
        ok(f"Lambda kodu güncellendi: {func_arn}")
        lam.get_waiter("function_updated").wait(FunctionName=FUNC_NAME)

    return func_arn

# ──────────────────────────────────────────────
def ensure_api_gateway(func_arn, account_id):
    print("\n[3/4] API Gateway")

    # Mevcut aynı isimde API var mı?
    apis = apigw.get_apis().get("Items", [])
    api = next((a for a in apis if a["Name"] == API_NAME), None)

    if api:
        api_id = api["ApiId"]
        ok(f"API zaten var: {api_id}")
    else:
        r = apigw.create_api(
            Name=API_NAME,
            ProtocolType="HTTP",
            CorsConfiguration={
                "AllowOrigins": ["*"],
                "AllowHeaders": ["Content-Type", "X-Api-Key", "Authorization"],
                "AllowMethods": ["GET", "OPTIONS"],
                "MaxAge":       300,
            },
            Description="AOM Dashboard HTTP API",
        )
        api_id = r["ApiId"]
        ok(f"API oluşturuldu: {api_id}")

    # Lambda integration
    integ_id = None
    integs = apigw.get_integrations(ApiId=api_id).get("Items", [])
    for i in integs:
        if FUNC_NAME in i.get("IntegrationUri", ""):
            integ_id = i["IntegrationId"]
            ok("Integration zaten var")
            break

    if not integ_id:
        func_uri = (
            f"arn:aws:apigateway:{REGION}:lambda:path"
            f"/2015-03-31/functions/{func_arn}/invocations"
        )
        ir = apigw.create_integration(
            ApiId=api_id,
            IntegrationType="AWS_PROXY",
            IntegrationUri=func_uri,
            PayloadFormatVersion="2.0",
            TimeoutInMillis=10000,
        )
        integ_id = ir["IntegrationId"]
        ok(f"Integration oluşturuldu: {integ_id}")

    # Route: GET /dashboard/summary
    routes = apigw.get_routes(ApiId=api_id).get("Items", [])
    route_key = "GET /dashboard/summary"
    if not any(r["RouteKey"] == route_key for r in routes):
        apigw.create_route(
            ApiId=api_id,
            RouteKey=route_key,
            Target=f"integrations/{integ_id}",
        )
        ok(f"Route oluşturuldu: {route_key}")
    else:
        ok(f"Route zaten var: {route_key}")

    # Stage: $default (auto-deploy)
    stages = apigw.get_stages(ApiId=api_id).get("Items", [])
    if not any(s["StageName"] == "$default" for s in stages):
        apigw.create_stage(ApiId=api_id, StageName="$default", AutoDeploy=True)
        ok("Stage oluşturuldu: $default")
    else:
        ok("Stage zaten var: $default")

    # Lambda'ya API Gateway'in çağırma iznini ver
    source_arn = f"arn:aws:execute-api:{REGION}:{account_id}:{api_id}/*/*/dashboard/summary"
    try:
        lam.add_permission(
            FunctionName=FUNC_NAME,
            StatementId="allow-apigw",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=source_arn,
        )
        ok("Lambda invoke izni verildi")
    except lam.exceptions.ResourceConflictException:
        ok("Lambda invoke izni zaten var")

    invoke_url = f"https://{api_id}.execute-api.{REGION}.amazonaws.com"
    ok(f"Invoke URL: {invoke_url}")
    return invoke_url

# ──────────────────────────────────────────────
def update_config_js(invoke_url):
    print("\n[4/4] config.js Güncelleniyor")
    try:
        with open(CONFIG_JS, "r", encoding="utf-8") as f:
            content = f.read()

        content = re.sub(
            r"MOCK_MODE:\s*(true|false)",
            "MOCK_MODE: false",
            content
        )
        content = re.sub(
            r"API_BASE_URL:\s*'[^']*'",
            f"API_BASE_URL: '{invoke_url}'",
            content
        )
        with open(CONFIG_JS, "w", encoding="utf-8") as f:
            f.write(content)
        ok("config.js güncellendi — MOCK_MODE: false")
        ok(f"API_BASE_URL: {invoke_url}")
    except Exception as e:
        log(f"config.js güncellenemedi (manuel yapın): {e}")

# ──────────────────────────────────────────────
def main():
    print("=" * 52)
    print("  AOM Dashboard — AWS Deploy")
    print("=" * 52)

    account_id = get_account_id()
    ok(f"AWS Hesap: {account_id} / {REGION}")

    if ARGS.role_arn:
        role_arn = ARGS.role_arn
        ok(f"Mevcut rol kullanılıyor: {role_arn}")
    else:
        role_arn = ensure_iam_role()
    func_arn   = ensure_lambda(role_arn)
    invoke_url = ensure_api_gateway(func_arn, account_id)
    update_config_js(invoke_url)

    print("\n" + "=" * 52)
    print("  DEPLOY TAMAMLANDI")
    print("=" * 52)
    print(f"\n  API URL  : {invoke_url}/dashboard/summary")
    print(f"  Test     : curl {invoke_url}/dashboard/summary")
    print(f"\n  Dashboard artik gercek DynamoDB verisini cekiyor.")
    print(f"  config.js'de MOCK_MODE=false olarak guncellendi.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n  HATA: {e}")
        sys.exit(1)

