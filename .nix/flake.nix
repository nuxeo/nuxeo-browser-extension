{
  description = "Nuxeo Browser Extension (development environment)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv.url = "github:cachix/devenv";
    corepack.url = "github:SnO2WMaN/corepack-flake";
    nix2container.url = "github:nlewo/nix2container";
    nix2container.inputs.nixpkgs.follows = "nixpkgs";
    mk-shell-bin.url = "github:rrbutani/nix-mk-shell-bin";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.devenv.flakeModule
      ];
      systems = [ "x86_64-linux" "i686-linux" "x86_64-darwin" "aarch64-linux" "aarch64-darwin" ];

      perSystem = { config, self', inputs', pkgs, system, ... }:
      let
        corepackOverlay = inputs.corepack.overlays.default;
        pkgsWithOverlay = import inputs.nixpkgs {
          inherit system;
          overlays = [ corepackOverlay ];
        };
        mkCorepack = corepackOverlay pkgs pkgs;
      in
      {
        devenv.shells.default = {
          name = "nuxeo-browser-extension";

          imports = [
            # This is just like the imports in devenv.nix.
            # See https://devenv.sh/guides/using-with-flake-parts/#import-a-devenv-module
            # ./devenv-foo.nix
          ];

          # https://devenv.sh/reference/options/
          packages = [
            pkgsWithOverlay.nodejs_22
            (mkCorepack.mkCorepack {
              nodejs = pkgsWithOverlay.nodejs_22;
              pm = "pnpm";
            })
          ];

          enterShell = ''
            echo "You're running pnpm in nodejs (stable version)"
            echo "Node version: $(node -v)"
            echo "pnpm version: $(pnpm -v)"
          '';
        };
      };

      flake = {
        # The usual flake attributes can be defined here, including system-
        # agnostic ones like nixosModule and system-enumerating ones, although
        # those are more easily expressed in perSystem.
      };
    };
}
