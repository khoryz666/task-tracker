{
  description = "task-tracker: dev environment for the local-first PWA";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            nodePackages.typescript
            python3
          ];

          shellHook = ''
            echo "task-tracker dev shell ready:"
            echo "  tsc:    $(tsc --version)"
            echo "  node:   $(node --version)"
            echo "  build:  ./build.sh"
            echo "  serve:  ./serve.sh   (http://localhost:8000)"
          '';
        };
      });
}
