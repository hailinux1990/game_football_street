// AI Manager - controls AI players
class AIManager {
    constructor() {
        this.players = [];
        this.ball = null;
        this.difficulty = 'normal';
    }

    setDifficulty(difficulty) {
        this.difficulty = difficulty;
    }

    update(dt, players, ball, state) {
        // Update each AI player
        for (let player of players) {
            if (player.aiControlled) {
                this.updateAIPlayer(player, dt, ball, state);
            }
        }
    }

    updateAIPlayer(player, dt, ball, state) {
        // Simple AI - move toward ball or to defensive position
        if (!player.active) return;

        // If player has ball, maybe pass/shoot
        if (player.hasBall && ball && ball.active) {
            // Find best teammate to pass to
            const teammate = this.findBestTeammate(player, players => player.teamMates);
            if (teammate && teammate.pos.dist(player.pos) < 70) {
                player.performPass(teammate.pos, ball);
            } else {
                // Shoot
                if (Math.random() < 0.05) {
                    player.performShot(ball);
                }
            }
            player.aiState = 'dribbling';
            return;
        }

        // Move toward ball
        if (ball && ball.active && ball.hasPhysics) {
            // Steer toward ball
            const ballDir = Vector2.sub(ball.pos, player.pos);
            const ballAngle = Math.atan2(ballDir.y, ballDir.x);
            const playerAngle = player.pos.angle();
            let angleDiff = playerAngle - ballAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Adjust move direction for dribbling
            if (Math.abs(angleDiff) < 0.5) {
                player.moveTarget = ball.clone().limit(player.maxSpeed);
                player.hasMoveInput = true;
            } else {
                // Turn toward ball
                player.moveTarget = Vector2.fromAngle(playerAngle + Math.sign(angleDiff) * 0.3, player.maxSpeed);
                player.hasMoveInput = true;
            }
            player.aiState = 'dribbling';
            return;
        }

        // Defensive positioning
        // Move back to defensive line
        player.aiState = 'defending';
        player.moveTarget = new Vector2(player.pos.x - (player.defensiveLine || 30), player.pos.y);
        player.hasMoveInput = true;
    }

    findBestTeammate(player, getMates) {
        let bestMate = null;
        let bestDist = Infinity;
        for (let mate of getMates()) {
            const dist = mate.pos.dist(player.pos);
            if (dist < bestDist && mate.active && mate.hasBall === false) {
                bestDist = dist;
                bestMate = mate;
            }
        }
        return bestMate;
    }

    // Update all players for a team
    updateTeam(team, players, ball, state) {
        for (let player of players) {
            if (player.team === team && player.aiControlled) {
                this.updateAIPlayer(player, 0.016, ball, state);
            }
        }
    }
}
