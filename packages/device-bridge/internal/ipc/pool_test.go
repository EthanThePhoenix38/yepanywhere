package ipc

import "testing"

func TestAndroidSerialForDeviceID(t *testing.T) {
	t.Setenv(useAPKForEmulatorEnvVar, "")

	if serial, ok := androidSerialForDeviceID("R3CN90ABCDE"); !ok || serial != "R3CN90ABCDE" {
		t.Fatalf("physical serial classification failed: ok=%v serial=%q", ok, serial)
	}
	if serial, ok := androidSerialForDeviceID("android:emulator-5554"); !ok || serial != "emulator-5554" {
		t.Fatalf("explicit android override failed: ok=%v serial=%q", ok, serial)
	}
	if _, ok := androidSerialForDeviceID("android:"); ok {
		t.Fatal("expected empty android: prefix to be rejected")
	}
	if _, ok := androidSerialForDeviceID("emulator-5554"); ok {
		t.Fatal("expected emulator to default to gRPC path without override env")
	}
	if _, ok := androidSerialForDeviceID("avd-Pixel_7"); ok {
		t.Fatal("expected stopped AVD to not resolve as android serial")
	}
	if _, ok := androidSerialForDeviceID("chromeos:chromeroot"); ok {
		t.Fatal("expected chromeos id to not resolve as android serial")
	}
}

func TestAndroidSerialForDeviceIDEmulatorOverrideEnv(t *testing.T) {
	t.Setenv(useAPKForEmulatorEnvVar, "true")

	if serial, ok := androidSerialForDeviceID("emulator-5554"); !ok || serial != "emulator-5554" {
		t.Fatalf("expected emulator id to map to android serial with override env: ok=%v serial=%q", ok, serial)
	}
}
