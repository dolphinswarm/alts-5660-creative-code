using Godot;

public partial class Main : Node3D
{
	private XRInterface _xrInterface;

	public override void _Ready()
	{
		_xrInterface = XRServer.FindInterface("OpenXR");

		if (_xrInterface != null && _xrInterface.IsInitialized())
		{
			GD.Print("OpenXR initialized");
			// The headset controls frame timing, so turn off monitor vsync
			DisplayServer.WindowSetVsyncMode(DisplayServer.VSyncMode.Disabled);
			GetViewport().UseXR = true;
		}
		else
		{
			GD.Print("OpenXR not initialized; is your headset connected?");
		}
	}
}
