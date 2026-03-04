import { useEffect, useState } from "react";

export default function useTelegram() {
    var [isTelegram, setIsTelegram] = useState(false);
    var [tgWebApp, setTgWebApp] = useState(null);

    useEffect(function () {
        var isReal = false;
        if (window.Telegram && window.Telegram.WebApp) {
            var tg = window.Telegram.WebApp;
            isReal =
                !!tg.initDataUnsafe &&
                !!tg.initDataUnsafe.user &&
                typeof tg.initDataUnsafe.user.id !== "undefined";
            setTgWebApp(tg);
        }
        setIsTelegram(isReal);
    }, []);

    return { isTelegram: isTelegram, tgWebApp: tgWebApp };
}