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

Web sürümünde destede tek papaz (K♠) bulunur ve üç kişilikli rakibe karşı oynanır:

- **Karakterler:** Ada (Meraklı) öne çıkan kartı sever, Efe (Temkinli) ondan kaçar,
  Mina (Kumarbaz) yemi umursamaz. Papazı tutarken ipucu verir ya da blöf yaparlar.
- **Yem:** kendi elinden bir kartı öne çıkarıp senden çekecek rakibi yönlendirebilirsin;
  masa, o an senden kimin çekeceğini ve karakterini gösterir.
- **Maç:** ilk kurtulan 3, ikinci 2, üçüncü 1 puan alır; 10 puana ulaşan maçı kazanır.
- **Kontroller:** fare/dokunmatik ya da `←` `→` + `Enter`; `K` elini karıştırır,
  `M` ses, `Esc` duraklat. Rakip hızı normal ya da hızlı seçilebilir.
