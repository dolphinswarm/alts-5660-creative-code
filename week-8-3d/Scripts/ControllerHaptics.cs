using Godot;

public partial class ControllerHaptics : Node
{
	[Export] public XRController3D LeftHand;
	[Export] public XRController3D RightHand;
	[Export] public Area3D StartButton;
	[Export] public double PickupStrength = 0.3;
	[Export] public double PickupDuration = 0.05;   // Seconds
	[Export] public double ButtonStrength = 0.6;
	[Export] public double ButtonDuration = 0.08;   // Seconds

	public override void _Ready()
	{
		foreach (var hand in new[] { LeftHand, RightHand })
		{
			// XR Tools' function_pickup script sits on the controller itself
			hand.Connect("has_picked_up", Callable.From<Node3D>(_ => Pulse(hand, PickupStrength, PickupDuration)));
		}

		// The button's own signal doesn't say which hand pressed it
		StartButton.AreaEntered += OnButtonTouched;
	}

	private void OnButtonTouched(Area3D area)
	{
		// Each hand's PokeArea is a direct child of its controller
		if (area.GetParent() is XRController3D hand)
		{
			Pulse(hand, ButtonStrength, ButtonDuration);
		}
	}

	private static void Pulse(XRController3D hand, double strength, double duration)
	{
		// Frequency 0 uses the runtime's default
		hand.TriggerHapticPulse("haptic", 0, strength, duration, 0);
	}
}
