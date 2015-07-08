'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        copy: {
            all: {
                files: [
                    {
                        expand: true,
                        cwd: 'src/',
                        src: '**/*.js',
                        dest: 'public/js/',
                    },
                    {
                        expand: true,
                        cwd: 'src/',
                        src: '**/*.css',
                        dest: 'public/css/',
                    },
                    {
                        expand: true,
                        cwd: 'node_modules/',
                        flatten: true,
                        src: ['bootstrap/dist/css/bootstrap.min.css'],
                        dest: 'public/css/',
                    },
                ],
            },
        }
    });
    require('load-grunt-tasks')(grunt);
    grunt.registerTask('default', ['copy']);
};
