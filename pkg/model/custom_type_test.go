package model

import (
	"errors"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"gorm.io/gorm"
)

func TestSliceString_Scan(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected SliceString
		wantErr  bool
	}{
		{"nil value", nil, nil, false},
		{"empty string", "", SliceString{""}, false},
		{"comma separated string", "a,b,c", SliceString{"a", "b", "c"}, false},
		{"byte slice", []byte("x,y,z"), SliceString{"x", "y", "z"}, false},
		{"single value string", "single", SliceString{"single"}, false},
		{"unsupported type", 123, nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var s SliceString
			err := s.Scan(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("Scan() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && !equalSliceString(s, tt.expected) {
				t.Errorf("Scan() got = %v, want %v", s, tt.expected)
			}
		})
	}
}

func TestSliceString_Value(t *testing.T) {
	tests := []struct {
		name     string
		input    SliceString
		expected string
	}{
		{"nil slice", nil, ""},
		{"empty slice", SliceString{}, ""},
		{"single value", SliceString{"foo"}, "foo"},
		{"multiple values", SliceString{"a", "b", "c"}, "a,b,c"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val, err := tt.input.Value()
			if err != nil {
				t.Errorf("Value() error = %v", err)
			}
			if val != tt.expected {
				t.Errorf("Value() got = %v, want %v", val, tt.expected)
			}
		})
	}
}

func TestLowerCaseString_Scan(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected LowerCaseString
		wantErr  bool
	}{
		{"nil value", nil, "", false},
		{"empty string", "", "", false},
		{"lowercase string", "hello", "hello", false},
		{"uppercase string", "HELLO", "hello", false},
		{"mixed case string", "HeLLo", "hello", false},
		{"byte slice", []byte("BYTES"), "bytes", false},
		{"unsupported type", 123, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var s LowerCaseString
			err := s.Scan(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("Scan() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && s != tt.expected {
				t.Errorf("Scan() got = %v, want %v", s, tt.expected)
			}
		})
	}
}

func TestLowerCaseString_Value(t *testing.T) {
	tests := []struct {
		name     string
		input    LowerCaseString
		expected string
	}{
		{"empty string", "", ""},
		{"already lowercase", "abc", "abc"},
		{"uppercase", "ABC", "abc"},
		{"mixed case", "AbC", "abc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val, err := tt.input.Value()
			if err != nil {
				t.Errorf("Value() error = %v", err)
			}
			if val != tt.expected {
				t.Errorf("Value() got = %v, want %v", val, tt.expected)
			}
		})
	}
}

func TestSecretString_ScanAndValue(t *testing.T) {
	originalKey := common.KiteEncryptKey
	common.KiteEncryptKey = "test-encryption-key"
	t.Cleanup(func() {
		common.KiteEncryptKey = originalKey
	})

	secret := SecretString("super-secret")
	encoded, err := secret.Value()
	if err != nil {
		t.Fatalf("Value() error = %v", err)
	}
	if encoded == "super-secret" || encoded == "" {
		t.Fatalf("Value() got unexpected encoded value = %v", encoded)
	}

	var decoded SecretString
	if err := decoded.Scan(encoded); err != nil {
		t.Fatalf("Scan() error = %v", err)
	}
	if decoded != secret {
		t.Fatalf("Scan() got = %v, want %v", decoded, secret)
	}
}

func TestJSONField_MarshalScanAndUnmarshal(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	var field JSONField
	if err := field.Marshal(payload{Name: "kite", Age: 3}); err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if len(field) == 0 {
		t.Fatal("Marshal() produced empty JSON")
	}

	val, err := field.Value()
	if err != nil {
		t.Fatalf("Value() error = %v", err)
	}
	if val == nil {
		t.Fatal("Value() returned nil")
	}

	var scanned JSONField
	if err := scanned.Scan(val); err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	var got payload
	if err := scanned.Unmarshal(&got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got.Name != "kite" || got.Age != 3 {
		t.Fatalf("Unmarshal() got = %+v, want %+v", got, payload{Name: "kite", Age: 3})
	}
}

func TestJSONField_UnmarshalNil(t *testing.T) {
	var field JSONField
	var got struct {
		Name string
	}
	if err := field.Unmarshal(&got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got.Name != "" {
		t.Fatalf("Unmarshal() mutated destination = %+v", got)
	}
}

func TestIsUniqueConstraintError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"gorm duplicated key", gorm.ErrDuplicatedKey, true},
		{"duplicate key message", errors.New("duplicate key value violates unique constraint"), true},
		{"duplicate entry message", errors.New("Duplicate entry 'x' for key"), true},
		{"other error", errors.New("something else"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isUniqueConstraintError(tt.err); got != tt.want {
				t.Fatalf("isUniqueConstraintError() = %v, want %v", got, tt.want)
			}
		})
	}
}

func equalSliceString(a, b SliceString) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
