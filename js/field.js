// Field Class - Street Football Pitch
class Field {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.goalWidth = 40;
        this.goalHeight = 60;
        this.goalPostRadius = 3;
        this.wallBounce = true;
        this.ballBounce = true;
        this.contained = true;
    }

    getGoalPosition(team) {
        // Return goal position based on team
        // Red goals at right, Blue at left (for example)
        if (team === 'red') {
            return new Vector2(this.x + this.width + this.goalWidth / 2, this.y + this.height / 2);
        } else {
            return new Vector2(this.x - this.goalWidth / 2, this.y + this.height / 2);
        }
    }

    isInField(pos) {
        if (pos.x < this.x || pos.x > this.x + this.width) return false;
        if (pos.y < this.y || pos.y > this.y + this.height) return false;
        return true;
    }

    isInGoal(pos, team) {
        const goalPos = this.getGoalPosition(team);
        const angle = Math.atan2(pos.y - goalPos.y, pos.x - goalPos.x);
        const dist = pos.dist(goalPos);
        if (dist < this.goalHeight / 2 && angle < Math.PI / 2) {
            // Check if within goal width
            const side = angle > (Math.PI / 2 - (this.goalWidth / 2 / dist));
            const side2 = angle < (Math.PI / 2 + (this.goalWidth / 2 / dist));
            if (side && side2) return true;
        }
        return false;
    }

    isGoalScored(ball, team) {
        const goalPos = this.getGoalPosition(team);
        const angle = Math.atan2(ball.pos.y - goalPos.y, ball.pos.x - goalPos.x);
        const dist = ball.pos.dist(goalPos);
        const inGoalWidth = Math.abs(Math.cos(angle)) * dist < this.goalWidth / 2;
        const inGoalHeight = Math.abs(Math.sin(angle)) * dist < this.goalHeight / 2;
        const movingToGoal = angle < -Math.PI / 2 || angle > Math.PI / 2;
        return dist < 25 && inGoalWidth && inGoalHeight && movingToGoal;
    }

    getCornerPositions() {
        return [
            new Vector2(this.x + 20, this.y + 20),
            new Vector2(this.x + this.width - 20, this.y + 20),
            new Vector2(this.x + 20, this.y + this.height - 20),
            new Vector2(this.x + this.width - 20, this.y + this.height - 20)
        ];
    }

    resetBall(ball) {
        const center = new Vector2(this.x + this.width / 2, this.y + this.height / 2);
        ball.pos = center.clone();
        ball.vel = new Vector2(0, 0);
        ball.hasPhysics = true;
    }
}
