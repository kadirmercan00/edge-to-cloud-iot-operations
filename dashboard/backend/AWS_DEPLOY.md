# AWS Entegrasyonu — Adım Adım Rehber

## Ne Yapıyoruz?
Dashboard şu an MOCK_MODE=true ile çalışıyor.
Gerçek DynamoDB verisini çekmek için aşağıdaki adımları izle.

---

## ADIM 1 — Lambda Fonksiyonu Oluştur

1. AWS Console → Lambda → "Create function"
2. Ayarlar:
   - Name: `aom-dashboard-api`
   - Runtime: Python 3.12
   - Architecture: x86_64
3. `aom-dashboard-api.py` içeriğini Code Editor'e yapıştır
4. **Deploy** et

### IAM Rolü (Lambda'nın DynamoDB okuma izni)
Lambda oluşturulunca otomatik bir rol oluşur. Bu role şunu ekle:
- AWS Console → IAM → Roles → `aom-dashboard-api-role-xxx`
- "Add permissions" → "Attach policies" → `AmazonDynamoDBReadOnlyAccess`

---

## ADIM 2 — API Gateway Oluştur

1. AWS Console → API Gateway → "Create API"
2. "HTTP API" seç (REST API değil — daha ucuz)
3. Ayarlar:
   - Name: `aom-dashboard`
   - Add integration: Lambda → `aom-dashboard-api`
4. Routes:
   - `GET /dashboard/summary` → Lambda entegrasyonu
5. CORS ayarı:
   - Allow origins: `http://127.0.0.1:5500` (dev) ve production URL'ini ekle
   - Allow headers: `Content-Type, X-Api-Key`
   - Allow methods: `GET, OPTIONS`
6. "Deploy" → Stage: `prod`
7. Invoke URL'i not al: `https://XXXXX.execute-api.me-central-1.amazonaws.com/prod`

---

## ADIM 3 — API Key Oluştur (Opsiyonel ama Önerilir)

1. API Gateway → API Keys → "Create API key"
2. Name: `aom-dashboard-key`
3. Usage Plan oluştur:
   - Throttle: 100 req/s
   - Quota: 10000 req/gün
4. API key'i kopyala

---

## ADIM 4 — config.js'i Güncelle

`Dashboard/assets/js/config.js` dosyasında:

```js
const CONFIG = Object.freeze({
  MOCK_MODE: false,                          // ← false yap
  API_BASE_URL: 'https://XXXXX.execute-api.me-central-1.amazonaws.com/prod',
  API_KEY: 'buraya-api-key-yapistir',
  ...
});
```

---

## ADIM 5 — DynamoDB Yapısını Kontrol Et

Lambda şu pk formatlarını okur:

| pk formatı         | Ne içeriyor              |
|--------------------|--------------------------|
| `STAFF#card001`    | Personel durumu          |
| `ASSET#Asset_01`| Endüstriyel Varlık bilgisi          |
| `TASK#TSK-xxx`     | Görev detayları          |
| `CONFIG#...`       | Sistem konfigürasyonu    |

Mevcut Lambda (protechnic-event-normalizer.py) zaten bu formatla yazıyor.
Dashboard Lambda'sı sadece okur — bir şeyi değiştirmez.

---

## Test Et

Live Server'da dashboard'u aç.
Sağ alt köşede `MOCK` yerine `LIVE` yazıyorsa gerçek veriye bağlısın.

Tarayıcı Console'da (F12) hata varsa:
- CORS hatası → API Gateway CORS ayarını kontrol et
- 403 Forbidden → API Key doğru mu?
- 500 → Lambda loglarını CloudWatch'tan kontrol et

