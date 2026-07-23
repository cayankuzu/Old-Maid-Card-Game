# Old Maid Card Game

Papaz Kaçtı mantığını dört oyunculu, otomatik ilerleyen bir Python simülasyonu olarak kuran nesne yönelimli kart oyunu.

Desteden tek bir papaz çıkarılır, kartlar oyunculara dağıtılır ve aynı değerdeki çiftler elenir. Her oyuncu sıradaki oyuncudan rastgele kart çeker; yeni oluşan çiftler temizlenir ve elini bitirenler oyundan çıkar. Eşsiz kartla en sonda kalan oyuncu kaybeder.

## Özellikler

- Kart, deste, oyuncu ve oyun sınıflarıyla okunabilir mimari
- Dört oyuncuya sıralı kart dağıtımı
- `Counter` tabanlı çift bulma ve temizleme
- Tekrarlanabilir oyun akışı için sabit rastgelelik tohumu
- Her turu ve güncel elleri terminalde gösteren otomatik simülasyon

## Çalıştırma

```bash
python old_maid_game.py
```

Proje yalnızca Python standart kütüphanesini kullanır.

## Web sürümü

[Papaz Kaçtı'yı tarayıcıda oyna](https://old-maid-card-game.vercel.app/)

Web sürümünde oyuncu, üç bilgisayar rakibine karşı kapalı kartlardan seçim yapar; çiftler ve rakip turları otomatik işlenir.
