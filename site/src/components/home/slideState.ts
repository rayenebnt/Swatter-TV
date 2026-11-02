'use client'
// Diapositive affichée (true) ou non : fournie par HeroClient autour de l'image de fond de chaque diapositive, lue par sa
// vidéo de fond (HeroVideo), qui ne tourne que sur la diapositive affichée.
import { createContext } from 'react'

export const SlideActive = createContext(false)
