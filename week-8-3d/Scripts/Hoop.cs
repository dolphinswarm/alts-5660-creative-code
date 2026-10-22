using Godot;

public partial class Hoop : Node3D
{
	[Signal] public delegate void ScoredEventHandler(RigidBody3D ball);

	[Export] public AudioStreamPlayer3D NetAudio;
	[Export] public Node3D RimMesh;             // Rim and net from the court model
	[Export] public Node3D NetMesh;
	[Export] public float RimScale = 1.5f;      // Bigger than regulation so scoring in VR is doable
	[Export] public float RimRadius = 0.196f;   // Inner radius of the model's rim before scaling
	[Export] public double FromBelowMemory = 3.0;
	[Export] public float NetSideDamp = 0.3f;   // Fraction of sideways speed kept in the net
	[Export] public float NetDropDamp = 0.7f;   // Fraction of downward speed kept in the net

	private static readonly StringName LastPositionMeta = "hoop_last_position";
	private static readonly StringName FromBelowMeta = "hoop_from_below_at";

	private static double Now => Time.GetTicksMsec() / 1000.0;

	public override void _Ready()
	{
		// Grow the model's rim and net around the rim center
		var grow = new Transform3D(Basis.FromScale(Vector3.One * RimScale), GlobalPosition * (1 - RimScale));
		RimMesh.GlobalTransform = grow * RimMesh.GlobalTransform;
		NetMesh.GlobalTransform = grow * NetMesh.GlobalTransform;
	}

	public override void _PhysicsProcess(double delta)
	{
		// Watches ball centers cross the rim plane; trigger areas report too late on fast shots
		foreach (var node in GetTree().GetNodesInGroup("ball"))
		{
			if (node is RigidBody3D ball)
			{
				CheckCrossing(ball);
			}
		}
	}

	private void CheckCrossing(RigidBody3D ball)
	{
		var current = ball.GlobalPosition;
		var previous = ball.HasMeta(LastPositionMeta) ? ball.GetMeta(LastPositionMeta).AsVector3() : current;
		ball.SetMeta(LastPositionMeta, current);

		var rimY = GlobalPosition.Y;
		var wentDown = previous.Y > rimY && current.Y <= rimY;
		var wentUp = previous.Y < rimY && current.Y >= rimY;

		if (!(wentDown || wentUp))
		{
			return;
		}

		// A center can only cross inside the ring by going through the hoop
		var crossing = previous.Lerp(current, (previous.Y - rimY) / (previous.Y - current.Y));
		var offset = new Vector2(crossing.X - GlobalPosition.X, crossing.Z - GlobalPosition.Z);
		if (offset.Length() > RimRadius * RimScale)
		{
			return;
		}

		if (wentUp)
		{
			ball.SetMeta(FromBelowMeta, Now);
			return;
		}

		// A ball thrown up through the net doesn't count on its way back down
		if (ball.HasMeta(FromBelowMeta))
		{
			var cameFromBelow = Now - ball.GetMeta(FromBelowMeta).AsDouble() < FromBelowMemory;
			ball.RemoveMeta(FromBelowMeta);
			if (cameFromBelow)
			{
				return;
			}
		}

		// The net has no collision, so slow the ball to look like it caught it
		var velocity = ball.LinearVelocity;
		ball.LinearVelocity = new Vector3(velocity.X * NetSideDamp, velocity.Y * NetDropDamp, velocity.Z * NetSideDamp);

		NetAudio.Play();
		EmitSignal(SignalName.Scored, ball);
	}
}
