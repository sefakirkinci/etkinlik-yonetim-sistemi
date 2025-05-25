const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");

// Firebase yapılandırması
const serviceAccount = require("./firebaseConfig.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://bilethanem-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../frontend")));

/*Kullanıcı Kayıt*/
app.post("/kullanici/kayit", (req, res) => {
  const { email, sifre } = req.body;
  if (!email || !sifre) return res.status(400).send({ mesaj: "Email ve şifre zorunludur." });

  const yeniKullanici = {
    email,
    sifre,
    onayli: false,
    ilkGiris: true,
    rol: "kullanici"
  };

  db.ref("kullanicilar").push().set(yeniKullanici, (err) => {
    if (err) return res.status(500).send({ mesaj: "Kayıt başarısız", hata: err });
    res.status(200).send({ mesaj: "Kayıt başarılı, admin onayı bekleniyor" });
  });
});

/*Kullanıcı Giriş*/
app.post("/kullanici/giris", async (req, res) => {
  const { email, sifre } = req.body;
  if (!email || !sifre) return res.status(400).send({ mesaj: "Email ve şifre zorunludur." });

  const snapshot = await db.ref("kullanicilar").orderByChild("email").equalTo(email).once("value");
  if (!snapshot.exists()) return res.status(404).send({ mesaj: "Kullanıcı bulunamadı." });

  const key = Object.keys(snapshot.val())[0];
  const kullanici = snapshot.val()[key];

  if (kullanici.sifre !== sifre) return res.status(401).send({ mesaj: "Şifre hatalı." });
  if (!kullanici.onayli) return res.status(403).send({ mesaj: "Admin onayı bekleniyor." });

  res.status(200).send({
    mesaj: "Giriş başarılı",
    email: kullanici.email,
    ilkGiris: kullanici.ilkGiris,
    rol: kullanici.rol || "kullanici"
  });
});

/*Şifre Değiştir*/
app.post("/kullanici/sifre-degistir", async (req, res) => {
  const { email, yeniSifre } = req.body;
  if (!email || !yeniSifre) return res.status(400).send({ mesaj: "Email ve yeni şifre zorunludur." });

  const snapshot = await db.ref("kullanicilar").orderByChild("email").equalTo(email).once("value");
  if (!snapshot.exists()) return res.status(404).send({ mesaj: "Kullanıcı bulunamadı." });

  const key = Object.keys(snapshot.val())[0];
  await db.ref(`kullanicilar/${key}`).update({ sifre: yeniSifre, ilkGiris: false });

  res.status(200).send({ mesaj: "Şifre başarıyla değiştirildi" });
});

/*Etkinlik Ekle (Admin)*/
app.post("/admin/etkinlik-ekle", (req, res) => {
  const { baslik, aciklama, tarih, kontenjan, tur, fiyat } = req.body;
  if (!baslik || !aciklama || !tarih || !kontenjan || !tur || !fiyat)
    return res.status(400).send({ mesaj: "Tüm alanlar zorunludur." });

  const etkinlik = {
    baslik,
    aciklama,
    tarih,
    kontenjan: parseInt(kontenjan),
    tur,
    fiyat: parseFloat(fiyat)
  };

  db.ref("etkinlikler").push().set(etkinlik, (err) => {
    if (err) return res.status(500).send({ mesaj: "Etkinlik eklenemedi", hata: err });
    res.status(200).send({ mesaj: "Etkinlik başarıyla eklendi" });
  });
});

/*Etkinlik Listele*/
app.get("/etkinlikler", async (req, res) => {
  const snapshot = await db.ref("etkinlikler").once("value");
  if (!snapshot.exists()) return res.status(200).send([]);

  const etkinlikler = snapshot.val();
  const liste = Object.keys(etkinlikler).map(id => ({ id, ...etkinlikler[id] }));
  res.status(200).send(liste);
});

/*Etkinlik Sil (Admin)*/
app.delete("/admin/etkinlik-sil", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send({ mesaj: "Etkinlik ID gerekli." });

  await db.ref(`etkinlikler/${id}`).remove();
  res.status(200).send({ mesaj: "Etkinlik silindi" });
});

/*Kullanıcı Onaylama*/
app.get("/kullanicilar-bekleyen", async (req, res) => {
  const snapshot = await db.ref("kullanicilar").once("value");
  if (!snapshot.exists()) return res.status(200).send([]);

  const veriler = snapshot.val();
  const bekleyenler = Object.keys(veriler)
    .filter(id => veriler[id].onayli === false)
    .map(id => ({ id, email: veriler[id].email }));

  res.status(200).send(bekleyenler);
});

app.post("/kullanici-onayla", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send({ mesaj: "ID gerekli" });

  await db.ref(`kullanicilar/${id}`).update({ onayli: true });
  res.status(200).send({ mesaj: "Kullanıcı onaylandı" });
});

/*Duyuru Ekle / Listele / Sil*/
app.post("/admin/duyuru-ekle", (req, res) => {
  const { baslik, icerik, tarih } = req.body;
  if (!baslik || !icerik || !tarih) return res.status(400).send({ mesaj: "Alanlar boş olamaz" });

  db.ref("duyurular").push().set({ baslik, icerik, tarih }, (err) => {
    if (err) return res.status(500).send({ mesaj: "Hata oluştu", hata: err });
    res.status(200).send({ mesaj: "Duyuru eklendi" });
  });
});

app.get("/duyurular", async (req, res) => {
  const snapshot = await db.ref("duyurular").once("value");
  if (!snapshot.exists()) return res.status(200).send([]);

  const veriler = snapshot.val();
  const liste = Object.keys(veriler).map(id => ({ id, ...veriler[id] }));
  res.status(200).send(liste);
});

app.delete("/duyuru-sil", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send({ mesaj: "ID gerekli" });

  await db.ref(`duyurular/${id}`).remove();
  res.status(200).send({ mesaj: "Duyuru silindi" });
});

/*Satın Alma ve Geçmiş*/
app.post("/satin-al", async (req, res) => {
  const { email, odemeYontemi, alinanlar, tarih } = req.body;
  if (!email || !alinanlar) return res.status(400).send({ mesaj: "Eksik bilgi" });

  const kayit = { odemeYontemi, alinanlar, tarih };
  const ref = db.ref(`satinAlmalar/${email.replace(".", "_")}`).push();
  await ref.set(kayit);
  res.status(200).send({ mesaj: "Satın alma kaydedildi" });
});

app.get("/satin-al-gecmis", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send({ mesaj: "Email gerekli" });

  const ref = db.ref(`satinAlmalar/${email.replace(".", "_")}`);
  const snapshot = await ref.once("value");
  if (!snapshot.exists()) return res.status(200).send([]);

  const veriler = snapshot.val();
  const liste = Object.keys(veriler).map(id => veriler[id]);
  res.status(200).send(liste);
});

/*Kontenjan Azalt (Satın alma sonrası)*/
app.post("/etkinlikler/kontenjan-azalt", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send({ mesaj: "ID eksik" });

  const ref = db.ref(`etkinlikler/${id}`);
  const snapshot = await ref.once("value");

  if (!snapshot.exists()) return res.status(404).send({ mesaj: "Etkinlik bulunamadı" });

  const etkinlik = snapshot.val();
  if (etkinlik.kontenjan <= 0) return res.status(400).send({ mesaj: "Kontenjan kalmadı" });

  await ref.update({ kontenjan: etkinlik.kontenjan - 1 });
  res.status(200).send({ mesaj: "Kontenjan azaltıldı" });
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`✅ Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
