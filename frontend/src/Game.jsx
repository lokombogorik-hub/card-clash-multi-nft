<div className="game-root">
    {gameOver && (
        <div className="game-over">
            <div className="game-over-box">
                <h2>
                    {winner === "player" && "Победа"}
                    {winner === "enemy" && "Поражение"}
                    {winner === "draw" && "Ничья"}
                </h2>
                <div className="game-over-buttons">
                    <button onClick={reset}>Заново</button>
                </div>
            </div>
        </div>
    )}

    <div className="hand top">
        {enemyHand.map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ marginLeft: i ? -40 : 0 }}>
                <MotionCard card={c} disabled faceDown />
            </div>
        ))}
    </div>

    <div className="scorebar">
        <span className="red">🟥 {score.red}</span>
        <span className="blue">{score.blue} 🟦</span>
    </div>

    <div className="board">
        {board.map((cell, i) => (
            <div
                key={i}
                className={`cell ${selected && !cell ? "highlight" : ""}`}
                onClick={() => placeCard(i)}
            >
                {cell && (
                    <MotionCard
                        card={cell}
                        // на поле карты кликабельность не нужна
                        disabled
                    />
                )}
            </div>
        ))}
    </div>

    <div className="hand bottom">
        {playerHand.map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ marginLeft: i ? -40 : 0 }}>
                <MotionCard
                    card={c}
                    selected={selectedId === c.id}
                    onClick={() => setSelectedId(c.id)}
                />
            </div>
        ))}
    </div>
</div>
    </LayoutGroup >
  );
}

/* ---------- CARD (animated) ---------- */
function MotionCard({ card, onClick, selected, disabled, faceDown }) {
    const controls = useAnimationControls();

    // flip-анимация при смене владельца (flipNonce увеличивается в tryFlip)
    useEffect(() => {
        if (!card) return;
        if (!card.flipNonce) return;

        controls.start({
            rotateY: [0, 90, 0],
            scale: [1, 1.08, 1],
            transition: { duration: 0.32, times: [0, 0.5, 1], ease: "easeInOut" },
        });
    }, [card?.flipNonce, controls, card]);

    const handleTiltMove = (e) => {
        // tilt на "внутреннем" слое, чтобы не конфликтовать с motion-transform
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;

        el.style.setProperty("--ry", `${px * 10}deg`);
        el.style.setProperty("--rx", `${-py * 10}deg`);
    };

    const handleTiltLeave = (e) => {
        const el = e.currentTarget;
        el.style.setProperty("--ry", `0deg`);
        el.style.setProperty("--rx", `0deg`);
    };

    return (
        <motion.div
            className="card-wrap"
            layoutId={card.id} // ключ к "перелёту" между рукой и полем
            animate={controls}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
            whileHover={!disabled ? { y: -10, scale: 1.03 } : undefined}
            whileTap={!disabled ? { scale: 0.985 } : undefined}
            onClick={disabled ? undefined : onClick}
        >
            <div
                className={[
                    "card",
                    card.owner === "player" ? "player" : "enemy",
                    selected ? "selected" : "",
                    disabled ? "disabled" : "",
                    faceDown ? "facedown" : "",
                ].join(" ")}
                onPointerMove={!disabled ? handleTiltMove : undefined}
                onPointerLeave={!disabled ? handleTiltLeave : undefined}
            >
                {!faceDown && (
                    <>
                        <div className="tt-badge" />
                        <span className="tt-num top">{card.values.top}</span>
                        <span className="tt-num left">{card.values.left}</span>
                        <span className="tt-num right">{card.values.right}</span>
                        <span className="tt-num bottom">{card.values.bottom}</span>
                    </>
                )}
            </div>
        </motion.div>
    );
}