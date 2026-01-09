import React from "react";

export default function Game({
    board,
    hand,
    enemyHand,
    selected,
    setSelected,
    placeCard,
    turn,
}) {
    return (
        <div className="screen game-root">
            {/* ===== ENEMY HAND ===== */}
            <div className="hand top">
                {enemyHand.map((card) => (
                    <div key={card.id} className="card enemy disabled">
                        <div className="card-image enemy-back" />
                    </div>
                ))}
            </div>

            {/* ===== BOARD ===== */}
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${selected ? "highlight" : ""}`}
                        onClick={() => selected && placeCard(i)}
                    >
                        {cell && (
                            <div className={`card ${cell.owner}`}>
                                <div
                                    className="card-image"
                                    style={{
                                        backgroundImage: `url(${cell.image})`,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ===== PLAYER HAND ===== */}
            <div className="hand bottom">
                {hand.map((card) => (
                    <div
                        key={card.id}
                        className={`card player ${selected?.id === card.id ? "selected" : ""
                            }`}
                        onClick={() => setSelected(card)}
                    >
                        <div
                            className="card-image"
                            style={{
                                backgroundImage: `url(${card.image})`,
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
