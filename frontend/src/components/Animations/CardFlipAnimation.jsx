class TripleTriadAnimations {
    // 1. ПЕРЕВОРОТ КАРТЫ 
    static flipCard(cardElement, newOwner, cardData) {
        const card = cardElement;

        // Фаза 1: Карта поднимается
        card.style.transform = 'translateY(-20px) scale(1.1)';
        card.style.transition = 'transform 0.2s ease-out';

        setTimeout(() => {
            // Фаза 2: Быстрый переворот
            card.style.transform = 'translateY(-20px) scale(1.1) rotateY(90deg)';

            // МЕНЯЕМ ВНЕШНИЙ ВИД В СЕРЕДИНЕ АНИМАЦИИ
            setTimeout(() => {
                // Смена владельца
                card.classList.remove('owner-blue', 'owner-red');
                card.classList.add(`owner-${newOwner}`);

                // Смена картинки, если у NFT есть альтернативное искусство
                const cardImage = card.querySelector('.card-art');
                if (cardData.alternateArt && newOwner === 'player') {
                    cardImage.src = cardData.alternateArt;
                }

                // Обновление значений карты
                this.updateCardValues(card, cardData);

                // Фаза 3: Завершение переворота
                card.style.transform = 'translateY(-20px) scale(1.1) rotateY(0deg)';

                // Фаза 4: Возврат на место
                setTimeout(() => {
                    card.style.transform = 'translateY(0) scale(1)';
                }, 200);
            }, 150);
        }, 200);
    }

    // 2. РАЗМЕЩЕНИЕ КАРТЫ НА ПОЛЕ
    static placeCardAnimation(cardElement, fromX, fromY, toX, toY) {
        // Эффект "броска" карты как в оригинале
        const card = cardElement.cloneNode(true);
        card.style.position = 'absolute';
        card.style.zIndex = '1000';
        card.style.left = `${fromX}px`;
        card.style.top = `${fromY}px`;

        document.body.appendChild(card);

        // Анимация полета по дуге
        const distanceX = toX - fromX;
        const distanceY = toY - fromY;

        card.animate([
            { transform: 'translate(0, 0) rotate(0deg)' },
            { transform: `translate(${distanceX / 2}px, -50px) rotate(180deg)` },
            { transform: `translate(${distanceX}px, ${distanceY}px) rotate(360deg)` }
        ], {
            duration: 600,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        });

        setTimeout(() => card.remove(), 600);
    }

    // 3. ЭФФЕКТ КОМБО (когда несколько карт переворачиваются)
    static comboEffect(cardElements) {
        // Волновая анимация как в оригинале
        cardElements.forEach((card, index) => {
            setTimeout(() => {
                // Эффект вспышки
                const flash = document.createElement('div');
                flash.className = 'combo-flash';
                card.appendChild(flash);

                // Звук комбо
                this.playSound('combo');

                // Анимация карты
                card.style.animation = 'combo-bounce 0.3s ease';

                setTimeout(() => {
                    flash.remove();
                    card.style.animation = '';
                }, 300);
            }, index * 100); // Задержка между картами
        });
    }

    // 4. СМЕНА КАРТИНОК ДЛЯ NFT
    static async updateCardArt(cardElement, nftData) {
        const card = cardElement;

        // Если есть анимированное искусство (GIF/WebM)
        if (nftData.animatedArt) {
            const video = document.createElement('video');
            video.src = nftData.animatedArt;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.className = 'card-animated-art';

            // Заменяем статичное изображение на анимированное
            const oldImage = card.querySelector('.card-static-art');
            if (oldImage) {
                oldImage.replaceWith(video);
            }
        }

        // Обновление редкости (рамка)
        const rarity = nftData.rarity;
        card.classList.remove('rarity-1', 'rarity-2', 'rarity-3', 'rarity-4', 'rarity-5');
        card.classList.add(`rarity-${rarity}`);

        // Эффект переливания для легендарных карт
        if (rarity >= 4) {
            card.classList.add('legendary-glow');
        }
    }
}