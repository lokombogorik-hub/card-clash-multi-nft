import React from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../../store/gameStore'
import BoardCell from './BoardCell'
import CoordinateLabels from './CoordinateLabels'
import ScoreDisplay from './ScoreDisplay'

const TripleTriadBoard = () => {
    const { board, selectedCard, placeCard, currentPlayer, players } = useGameStore()

    const handleCellClick = (row, col) => {
        if (selectedCard && !board[row][col]) {
            placeCard(row, col, selectedCard)
        }
    }

    return (
        <div className="relative p-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl border-4 border-gold shadow-2xl">
            {/* Метки координат */}
            <CoordinateLabels />

            {/* Игровое поле */}
            <div className="relative grid grid-cols-3 gap-4 p-4">
                {board.map((row, rowIndex) => (
                    row.map((cell, colIndex) => (
                        <BoardCell
                            key={`${rowIndex}-${colIndex}`}
                            row={rowIndex}
                            col={colIndex}
                            card={cell?.card}
                            player={cell?.player}
                            flipped={cell?.flipped}
                            onClick={() => handleCellClick(rowIndex, colIndex)}
                            coordinates={['A', 'B', 'C'][rowIndex] + (colIndex + 1)}
                        />
                    ))
                ))}
            </div>

            {/* Отображение счета */}
            <ScoreDisplay />

            {/* Индикатор текущего хода */}
            <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
                <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg"
                >
                    <span className="font-bold text-lg">
                        Ход: {players[currentPlayer]?.username || `Игрок ${currentPlayer + 1}`}
                    </span>
                </motion.div>
            </div>
        </div>
    )
}

export default TripleTriadBoard