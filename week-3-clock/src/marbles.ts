import * as Matter from "matter-js";
import { Container, Graphics } from "pixi.js";

//#region Types / Consts
export type Marble = { body: Matter.Body; graphic: Graphics };

const MARBLE_RADIUS = 6;
/** A tiny amount of horizontal jitter so marble spawn has some variation */
const SPAWN_JITTER = 10;

const WALL_KICK = 0.12;
const WALL_MIN_KICK = 0.75;
const WALL_PUSH = 2.5;

type MarblePosition = { x: number; y: number };

const chuteByBody = new Map<Matter.Body, number>();
//#endregion

/** Drops a new marble in from "chuteIndex"'s spawn point, tagged for that chute's voice/color */
export const spawnMarble = (
	world: Matter.World,
	layer: Container,
	position: MarblePosition,
	chuteIndex: number,
	color: string,
): Marble => {
	const { x, y } = position;
	const body = Matter.Bodies.circle(
		x + (Math.random() - 0.5) * SPAWN_JITTER,
		y,
		MARBLE_RADIUS,
		{
			restitution: 0.7,
			friction: 0.01,
			frictionAir: 0.0005,
			label: "marble",
		},
	);
	Matter.Composite.add(world, body);
	chuteByBody.set(body, chuteIndex);

	const graphic = new Graphics().circle(0, 0, MARBLE_RADIUS).fill(color);
	graphic.position.set(body.position.x, body.position.y);
	layer.addChild(graphic);

	return { body, graphic };
};

/** Which chute spawned this body, for a collision handler that only has the raw Matter body */
export const chuteIndexOf = (body: Matter.Body): number | undefined =>
	chuteByBody.get(body);

/** Bounces "body" off a wall with a guaranteed upward kick and outward shove; otherwise, the ball just hits the wall and falls LOL*/
export const kickOffWall = (body: Matter.Body) => {
	const fallSpeed = Math.max(body.velocity.y, 0);
	const pushDirection = Math.sign(body.velocity.x) || 1;

	Matter.Body.setVelocity(body, {
		x: pushDirection * Math.max(Math.abs(body.velocity.x), WALL_PUSH),
		y: -Math.max(fallSpeed * WALL_KICK, WALL_MIN_KICK),
	});
};

/** Moves the Pixi graphic to match the marble's physics position */
export const syncMarble = ({ body, graphic }: Marble) => {
	graphic.position.set(body.position.x, body.position.y);
};

/** Removes a marble from the physics world, the render layer, and the chute lookup */
export const removeMarble = (
	world: Matter.World,
	layer: Container,
	marble: Marble,
) => {
	chuteByBody.delete(marble.body);
	Matter.Composite.remove(world, marble.body);
	layer.removeChild(marble.graphic);
	marble.graphic.destroy();
};

