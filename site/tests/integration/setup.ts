// Chaque fichier de tests d'intégration : connexion à la base fermée à la fin (sinon le processus ne s'arrête pas).
import { afterAll } from 'vitest'
import { closePayload } from './helpers'

afterAll(closePayload)
